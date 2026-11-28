package server

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// saturatingMDBList stands in for api.mdblist.com under a sweep: each batch
// takes perOpen for every batch open alongside it, up to most, so the more a
// sweep sends at once the slower every batch gets. Single lookups answer at once.
type saturatingMDBList struct {
	srv     *httptest.Server
	perOpen time.Duration
	most    time.Duration
	open    atomic.Int32
	maxOpen atomic.Int32
	posts   atomic.Int32
	gets    atomic.Int32
}

func newSaturatingMDBList(t *testing.T, perOpen, most time.Duration) *saturatingMDBList {
	t.Helper()
	f := &saturatingMDBList{perOpen: perOpen, most: most}
	f.srv = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet {
			f.gets.Add(1)
			_ = json.NewEncoder(w).Encode(map[string]any{"score": 70.0,
				"ratings": []map[string]any{{"source": "imdb", "value": 7.0}}})
			return
		}
		f.posts.Add(1)
		n := f.open.Add(1)
		defer f.open.Add(-1)
		for {
			m := f.maxOpen.Load()
			if n <= m || f.maxOpen.CompareAndSwap(m, n) {
				break
			}
		}
		var body struct {
			IDs []string `json:"ids"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		d := time.Duration(n) * f.perOpen
		if d > f.most {
			d = f.most
		}
		select {
		case <-time.After(d):
		case <-r.Context().Done():
			return
		}
		out := make([]map[string]any, 0, len(body.IDs))
		for _, id := range body.IDs {
			out = append(out, map[string]any{"type": "movie", "ids": map[string]any{"imdb": id},
				"score": 80.0, "ratings": []map[string]any{{"source": "imdb", "value": 8.0}}})
		}
		_ = json.NewEncoder(w).Encode(out)
	}))
	t.Cleanup(f.srv.Close)
	return f
}

// mdblistAt builds the real MDBList provider, with its pacing, governor and
// batcher, dialling fake instead of api.mdblist.com. The client clones
// http.DefaultTransport when it is built, so the swap lasts only for that call.
func mdblistAt(t *testing.T, fake *saturatingMDBList) *provider.MDBList {
	t.Helper()
	target := fake.srv.Listener.Addr().String()
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.Proxy = nil
	tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // test server only
	dialer := &net.Dialer{}
	tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		if addr == "api.mdblist.com:443" {
			addr = target
		}
		return dialer.DialContext(ctx, network, addr)
	}
	prev := http.DefaultTransport
	http.DefaultTransport = tr
	defer func() { http.DefaultTransport = prev }()
	return provider.NewMDBList("simulation-key")
}

type renderOutcome struct {
	class    provider.CallerClass
	admitted bool
	wait     time.Duration
	hold     time.Duration
	err      error
}

// A third-party sweep against a saturating MDBList, with people browsing at
// the same time. Bulk renders take render slots the way the handler gives them
// (acquireBulk, standing aside for anyone queued) and look their ratings up
// through the batcher; background refreshes add batch pressure without holding
// a slot. People's renders must still be admitted and finish, and no bulk
// render may sit on a slot much past its short wait for an MDBList batch.
func TestASweepAgainstASaturatedMDBListLeavesRenderSlotsForPeople(t *testing.T) {
	if testing.Short() {
		t.Skip("simulates several seconds of a sweep")
	}
	t.Setenv("XRDB_MDBLIST_BULK_BATCHES", "2")
	t.Setenv("XRDB_MDBLIST_BULK_BATCH_WAIT_MS", "1500")
	fake := newSaturatingMDBList(t, 900*time.Millisecond, 10*time.Second)
	mdb := mdblistAt(t, fake)

	const (
		capacity        = 16
		bulkRenders     = 40
		bulkWeight      = 1 // episode thumbnails, what the sweep asks for
		refreshes       = 120
		people          = 20
		personWeight    = weightUnit
		bulkQueueWait   = 20 * time.Second
		personQueueWait = 8 * time.Second
	)
	lim := newConcurrencyLimiter(capacity)

	var bulkQueued, peopleQueued atomic.Int32
	var mu sync.Mutex
	var outcomes []renderOutcome
	record := func(o renderOutcome) {
		mu.Lock()
		outcomes = append(outcomes, o)
		mu.Unlock()
	}

	type sample struct {
		at                  time.Duration
		bulk, people, held  int64
		batchesOpenUpstream int32
	}
	var samples []sample
	start := time.Now()
	stopSampling := make(chan struct{})
	sampled := make(chan struct{})
	go func() {
		defer close(sampled)
		tick := time.NewTicker(50 * time.Millisecond)
		defer tick.Stop()
		for {
			select {
			case <-stopSampling:
				return
			case <-tick.C:
				held, _ := lim.occupancy()
				samples = append(samples, sample{at: time.Since(start),
					bulk: int64(bulkQueued.Load()), people: int64(peopleQueued.Load()),
					held: held, batchesOpenUpstream: fake.open.Load()})
			}
		}
	}()

	render := func(class provider.CallerClass, id string, weight int64) {
		ctx, cancel := context.WithTimeout(provider.WithCallerClass(context.Background(), class), 45*time.Second)
		defer cancel()
		queued := time.Now()
		var admitted bool
		if class == provider.CallerBulk {
			bulkQueued.Add(1)
			admitted = lim.acquireBulk(ctx, bulkQueueWait, weight)
			bulkQueued.Add(-1)
		} else {
			peopleQueued.Add(1)
			admitted = lim.acquireWithin(ctx, personQueueWait, weight)
			peopleQueued.Add(-1)
		}
		o := renderOutcome{class: class, admitted: admitted, wait: time.Since(queued)}
		if !admitted {
			record(o)
			return
		}
		held := time.Now()
		_, o.err = mdb.Fetch(ctx, "movie", id)
		time.Sleep(20 * time.Millisecond) // compose and encode
		lim.release(weight)
		o.hold = time.Since(held)
		record(o)
	}

	var wg sync.WaitGroup
	for i := range bulkRenders {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			time.Sleep(time.Duration(i) * 25 * time.Millisecond)
			render(provider.CallerBulk, fmt.Sprintf("tt1%06d", i), bulkWeight)
		}(i)
	}
	var refreshFailed atomic.Int32
	for i := range refreshes {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			time.Sleep(time.Duration(i) * 20 * time.Millisecond)
			ctx := provider.WithCallerClass(context.Background(), provider.CallerBulk)
			if _, err := mdb.Fetch(ctx, "movie", fmt.Sprintf("tt2%06d", i)); err != nil {
				refreshFailed.Add(1)
			}
		}(i)
	}
	for i := range people {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			time.Sleep(300*time.Millisecond + time.Duration(i)*150*time.Millisecond)
			render(provider.CallerInteractive, fmt.Sprintf("tt3%06d", i), personWeight)
		}(i)
	}
	wg.Wait()
	close(stopSampling)
	<-sampled
	elapsed := time.Since(start)

	var personWaits, bulkHolds []time.Duration
	var peopleDone, bulkDone, bulkShed, bulkHeldOut, bulkOtherErr int
	for _, o := range outcomes {
		switch o.class {
		case provider.CallerInteractive:
			if !o.admitted {
				t.Errorf("a person's render was shed after %v", o.wait)
				continue
			}
			if o.err != nil {
				t.Errorf("a person's render lost MDBList: %v", o.err)
			}
			peopleDone++
			personWaits = append(personWaits, o.wait)
		default:
			if !o.admitted {
				bulkShed++
				continue
			}
			bulkDone++
			bulkHolds = append(bulkHolds, o.hold)
			switch {
			case o.err == nil:
			case errors.Is(o.err, provider.ErrGovernorBacklog):
				bulkHeldOut++
			default:
				bulkOtherErr++
			}
		}
	}
	sort.Slice(personWaits, func(i, j int) bool { return personWaits[i] < personWaits[j] })
	sort.Slice(bulkHolds, func(i, j int) bool { return bulkHolds[i] < bulkHolds[j] })
	pct := func(d []time.Duration, p float64) time.Duration {
		if len(d) == 0 {
			return 0
		}
		return d[int(float64(len(d)-1)*p)]
	}

	var maxBulkQ, maxPeopleQ, maxHeld int64
	var timeline strings.Builder
	bucket := time.Duration(-1)
	var bBulk, bPeople, bHeld int64
	var bOpen int32
	flush := func() {
		if bucket >= 0 {
			fmt.Fprintf(&timeline, "\n  t=%4.1fs bulk_queued<=%2d people_queued<=%d held<=%2d/%d upstream_batches<=%d",
				bucket.Seconds(), bBulk, bPeople, bHeld, capacity, bOpen)
		}
	}
	for _, s := range samples {
		maxBulkQ = max(maxBulkQ, s.bulk)
		maxPeopleQ = max(maxPeopleQ, s.people)
		maxHeld = max(maxHeld, s.held)
		if b := s.at.Truncate(500 * time.Millisecond); b != bucket {
			flush()
			bucket, bBulk, bPeople, bHeld, bOpen = b, 0, 0, 0, 0
		}
		bBulk, bPeople, bHeld = max(bBulk, s.bulk), max(bPeople, s.people), max(bHeld, s.held)
		bOpen = max(bOpen, s.batchesOpenUpstream)
	}
	flush()

	t.Logf("sweep took %v; upstream batches %d (max %d open at once), single lookups %d",
		elapsed.Round(10*time.Millisecond), fake.posts.Load(), fake.maxOpen.Load(), fake.gets.Load())
	t.Logf("people: %d/%d finished, queue wait p50 %v p95 %v max %v",
		peopleDone, people, pct(personWaits, .5).Round(time.Millisecond),
		pct(personWaits, .95).Round(time.Millisecond), pct(personWaits, 1).Round(time.Millisecond))
	t.Logf("bulk renders: %d admitted, %d shed, %d answered, %d fell back on the slot wait, %d other errors; slot hold p50 %v p95 %v max %v",
		bulkDone, bulkShed, bulkDone-bulkHeldOut-bulkOtherErr, bulkHeldOut, bulkOtherErr,
		pct(bulkHolds, .5).Round(time.Millisecond), pct(bulkHolds, .95).Round(time.Millisecond),
		pct(bulkHolds, 1).Round(time.Millisecond))
	t.Logf("background refreshes: %d/%d fell back; render queue max: bulk %d, people %d, held %d/%d%s",
		refreshFailed.Load(), refreshes, maxBulkQ, maxPeopleQ, maxHeld, capacity, timeline.String())

	if peopleDone != people {
		t.Fatalf("%d of %d people's renders finished", peopleDone, people)
	}
	if got := fake.maxOpen.Load(); got > 2 {
		t.Errorf("%d sweep batches were open upstream at once, want at most 2", got)
	}
	// A bulk render holds its slot for the batch window, at most the 1.5s slot
	// wait, and one batch in flight (1.8s with two open). Uncapped, the same
	// sweep holds slots for over 5s through header timeouts and retries.
	if worst := pct(bulkHolds, 1); worst > 4500*time.Millisecond {
		t.Errorf("a bulk render held its render slot for %v", worst)
	}
	if worst := pct(personWaits, 1); worst > 4*time.Second {
		t.Errorf("a person waited %v for a render slot behind the sweep", worst)
	}
	if bulkQueued.Load() != 0 || peopleQueued.Load() != 0 {
		t.Errorf("the render queue did not drain: bulk %d, people %d", bulkQueued.Load(), peopleQueued.Load())
	}
}
