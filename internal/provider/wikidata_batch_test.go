package provider

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// A stub WDQS that answers a batched query with two rows for each title it
// knows, in reverse order, so a match by position would mix titles up.
func batchStub(t *testing.T, interval, maxWait time.Duration, known map[string]string) (*Wikidata, *atomic.Int32) {
	t.Helper()
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		q := r.URL.Query().Get("query")
		var rows []string
		for id, rt := range known {
			if strings.Contains(q, `"`+id+`"`) {
				rows = append([]string{
					`{"imdb":{"value":"` + id + `"},"reviewer":{"value":"http://www.wikidata.org/entity/Q105584"},"score":{"value":"` + rt + `"}}`,
					`{"imdb":{"value":"` + id + `"},"reviewer":{"value":"http://www.wikidata.org/entity/Q150248"},"score":{"value":"50/100"}}`,
				}, rows...)
			}
		}
		w.Header().Set("Content-Type", "application/sparql-results+json")
		_, _ = w.Write([]byte(`{"results":{"bindings":[` + strings.Join(rows, ",") + `]}}`))
	}))
	t.Cleanup(srv.Close)
	transport := &throttledTransport{source: "wikidata", pacer: &pacer{interval: interval, maxWait: maxWait, source: "wikidata"}}
	w := &Wikidata{httpClient: &http.Client{Timeout: 5 * time.Second, Transport: transport}, endpoint: srv.URL}
	w.batch = newWikidataBatcher(w, 20)
	return w, &calls
}

func rtOf(m *MediaMeta) float64 {
	for _, r := range m.Ratings {
		if r.Source == "rt" {
			return r.Value
		}
	}
	return -1
}

// Titles waiting on one paced slot go in one query, and each gets its own rows.
func TestTitlesWaitingOnOneSlotShareOneQuery(t *testing.T) {
	known := map[string]string{"tt0000001": "91%", "tt0000002": "40%", "tt0000003": "77%"}
	w, calls := batchStub(t, 300*time.Millisecond, 2*time.Second, known)
	// Take the next slot so the batch has to wait and the others can join it.
	if _, _, _, err := w.batch.pacer().reserve(CallerInteractive, 0, false, time.Second); err != nil {
		t.Fatal(err)
	}
	ids := []string{"tt0000001", "tt0000002", "tt0000003", "tt0000009"}
	got := make([]*MediaMeta, len(ids))
	errs := make([]error, len(ids))
	var wg sync.WaitGroup
	for i, id := range ids {
		wg.Add(1)
		go func(i int, id string) {
			defer wg.Done()
			got[i], errs[i] = w.Fetch(WithCallerClass(context.Background(), CallerInteractive), "movie", id)
		}(i, id)
		time.Sleep(10 * time.Millisecond)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("%s: %v", ids[i], err)
		}
	}
	if n := calls.Load(); n != 1 {
		t.Fatalf("queries sent = %d, want 1", n)
	}
	for i, want := range []float64{9.1, 4.0, 7.7} {
		if rtOf(got[i]) != want {
			t.Errorf("%s rt = %v, want %v", ids[i], rtOf(got[i]), want)
		}
	}
	if len(got[3].Ratings) != 0 {
		t.Errorf("a title with no rows got %v, want no ratings", got[3].Ratings)
	}
}

// A malformed id is turned away before it joins, so it cannot break the query
// for anyone else.
func TestAMalformedIDNeverJoinsABatch(t *testing.T) {
	w, calls := batchStub(t, 10*time.Millisecond, time.Second, map[string]string{})
	if _, err := w.Fetch(context.Background(), "movie", `tt1" } ?x ?y {`); !errors.Is(err, ErrNotApplicable) {
		t.Fatalf("err = %v, want ErrNotApplicable", err)
	}
	if calls.Load() != 0 {
		t.Fatal("a malformed id reached the source")
	}
}

// A person who joins a batch a sweep opened is not refused for the sweep's
// shorter queue. The sweep's slot is pushed back by people queuing past it until
// it is beyond a sweep's quarter, and the batch goes again under the person's.
func TestAPersonJoiningASweepsBatchIsServed(t *testing.T) {
	known := map[string]string{"tt0000001": "91%", "tt0000002": "40%"}
	w, calls := batchStub(t, time.Second, 6*time.Second, known)
	p := w.batch.pacer()
	if _, _, _, err := p.reserve(CallerInteractive, 0, false, 6*time.Second); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	var personErr error
	var person *MediaMeta
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, _ = w.Fetch(WithCallerClass(context.Background(), CallerBulk), "movie", "tt0000001")
	}()
	time.Sleep(20 * time.Millisecond)
	go func() {
		defer wg.Done()
		person, personErr = w.Fetch(WithCallerClass(context.Background(), CallerInteractive), "movie", "tt0000002")
	}()
	time.Sleep(20 * time.Millisecond)
	// Two people take slots ahead of the sweep's, moving it two intervals back.
	for i := 0; i < 2; i++ {
		if _, _, _, err := p.reserve(CallerInteractive, 0, false, 6*time.Second); err != nil {
			t.Fatal(err)
		}
	}
	wg.Wait()
	if personErr != nil {
		t.Fatalf("the person was refused because a sweep opened the batch: %v", personErr)
	}
	if rtOf(person) != 4.0 {
		t.Errorf("person rt = %v, want 4.0", rtOf(person))
	}
	if n := calls.Load(); n != 1 {
		t.Errorf("queries sent = %d, want 1", n)
	}
}

// When the shared query fails, the caller that opened it carries the failure
// for health and the riders do not count it again.
func TestARidersFailureIsNotCountedAgainstHealth(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusBadGateway)
	}))
	t.Cleanup(srv.Close)
	transport := &throttledTransport{source: "wikidata", pacer: &pacer{interval: 200 * time.Millisecond, maxWait: time.Second, source: "wikidata"}}
	w := &Wikidata{httpClient: &http.Client{Timeout: 2 * time.Second, Transport: transport}, endpoint: srv.URL}
	w.batch = newWikidataBatcher(w, 20)
	if _, _, _, err := w.batch.pacer().reserve(CallerInteractive, 0, false, time.Second); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i, id := range []string{"tt0000001", "tt0000002"} {
		wg.Add(1)
		go func(i int, id string) { defer wg.Done(); _, errs[i] = w.Fetch(context.Background(), "movie", id) }(i, id)
		time.Sleep(10 * time.Millisecond)
	}
	wg.Wait()
	if errs[0] == nil || errs[1] == nil {
		t.Fatalf("errs = %v, want both to fail", errs)
	}
	counted := 0
	for _, err := range errs {
		if !errors.Is(err, errWikidataBatchShared) {
			counted++
		}
	}
	if counted != 1 {
		t.Errorf("callers carrying the failure = %d, want exactly 1 (errs %v)", counted, errs)
	}
}

// The caller that opened a batch may have left before it fails. Someone still
// waiting carries the failure, or an outage seen only by riders never counts.
func TestAFailureCountsOnceEvenWhenTheOpenerHasLeft(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
	}))
	t.Cleanup(srv.Close)
	transport := &throttledTransport{source: "wikidata", pacer: &pacer{interval: 300 * time.Millisecond, maxWait: 2 * time.Second, source: "wikidata"}}
	w := &Wikidata{httpClient: &http.Client{Timeout: 2 * time.Second, Transport: transport}, endpoint: srv.URL}
	w.batch = newWikidataBatcher(w, 20)
	if _, _, _, err := w.batch.pacer().reserve(CallerInteractive, 0, false, time.Second); err != nil {
		t.Fatal(err)
	}
	opener, cancel := context.WithCancel(context.Background())
	go func() { _, _ = w.Fetch(opener, "movie", "tt0000001") }()
	time.Sleep(10 * time.Millisecond)
	cancel()
	_, err := w.Fetch(context.Background(), "movie", "tt0000002")
	if err == nil || errors.Is(err, errWikidataBatchShared) {
		t.Fatalf("err = %v, want the remaining caller to carry the failure", err)
	}
}

// A batch ends when the last caller waiting on it leaves. A stall past every
// caller's own deadline is then cut off rather than run to the client limit,
// where a timeout would be counted against the source.
func TestABatchIsCancelledWhenEveryoneHasLeft(t *testing.T) {
	cancelled := make(chan struct{}, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
			cancelled <- struct{}{}
		case <-time.After(3 * time.Second):
		}
	}))
	t.Cleanup(srv.Close)
	transport := &throttledTransport{source: "wikidata", pacer: &pacer{interval: 10 * time.Millisecond, maxWait: time.Second, source: "wikidata"}}
	w := &Wikidata{httpClient: &http.Client{Timeout: 5 * time.Second, Transport: transport}, endpoint: srv.URL}
	w.batch = newWikidataBatcher(w, 20)
	var wg sync.WaitGroup
	for _, id := range []string{"tt0000001", "tt0000002"} {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
			defer cancel()
			if _, err := w.Fetch(ctx, "movie", id); !errors.Is(err, context.DeadlineExceeded) {
				t.Errorf("%s err = %v, want the caller's own deadline", id, err)
			}
		}(id)
	}
	wg.Wait()
	select {
	case <-cancelled:
	case <-time.After(2 * time.Second):
		t.Fatal("the request ran on after every caller had left")
	}
}

// Time a request spends in our own queue is not charged to Wikidata: the bound
// starts when the pacer grants the slot.
func TestQueueTimeIsNotChargedToWikidata(t *testing.T) {
	w := NewWikidata()
	if w.httpClient.Timeout != 0 {
		t.Fatalf("client timeout = %v, want none: it would include our own queue", w.httpClient.Timeout)
	}
	base, _ := w.httpClient.Transport.(*throttledTransport).base.(*wikidataBatchTransport).next.(*http.Transport)
	if base == nil || base.ResponseHeaderTimeout != wikidataHeaderTimeout {
		t.Fatalf("header timeout not set on the transport under the pacer")
	}

	delay := 0 * time.Millisecond
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(delay)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(srv.Close)
	inner := http.DefaultTransport.(*http.Transport).Clone()
	inner.ResponseHeaderTimeout = 300 * time.Millisecond
	transport := &throttledTransport{source: "wikidata", base: inner,
		policy: RateLimit{HeaderTimeout: 300 * time.Millisecond},
		pacer:  &pacer{interval: 400 * time.Millisecond, maxWait: 5 * time.Second, source: "wikidata"}}
	client := &http.Client{Transport: transport}
	for i := 0; i < 3; i++ {
		if _, _, _, err := transport.pacer.reserve(CallerInteractive, 0, false, 5*time.Second); err != nil {
			t.Fatal(err)
		}
	}
	started := time.Now()
	resp, err := client.Get(srv.URL)
	if err != nil {
		t.Fatalf("a fast answer after %v in our queue failed: %v", time.Since(started), err)
	}
	resp.Body.Close()
	if waited := time.Since(started); waited < time.Second {
		t.Fatalf("waited %v, the test needs the queue to outlast the header timeout", waited)
	}

	delay = 600 * time.Millisecond
	if _, err := client.Get(srv.URL); err == nil {
		t.Fatal("a slow answer was not bounded by the header timeout")
	}
}
