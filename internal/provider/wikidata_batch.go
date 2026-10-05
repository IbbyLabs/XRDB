package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// wikidataBatchSize is how many titles one query may carry. WDQS answers twenty
// titles in about the time it answers one, and the pacer charges per request.
func wikidataBatchSize() int {
	return envInt("XRDB_WIKIDATA_BATCH", 20, 1, 50)
}

// wikidataBatchQuery asks for the review scores of several titles at once. Each
// row names the title it belongs to, so rows are matched back by IMDb id.
func wikidataBatchQuery(imdbIDs []string) string {
	vals := make([]string, len(imdbIDs))
	for i, id := range imdbIDs {
		vals[i] = `"` + id + `"`
	}
	return `SELECT ?imdb ?reviewer ?score ?method WHERE {
  VALUES ?imdb { ` + strings.Join(vals, " ") + ` }
  ?item wdt:P345 ?imdb .
  ?item p:P444 ?statement .
  ?statement ps:P444 ?score .
  ?statement pq:P447 ?reviewer .
  OPTIONAL { ?statement pq:P459 ?method . }
  VALUES ?reviewer { wd:` + wikidataRottenTomatoes + ` wd:` + wikidataMetacritic + ` }
}`
}

// errWikidataBatchShared marks a failure a caller received because the batch it
// rode in failed. One caller still waiting carries the failure for health; the
// riders do not count it again.
var errWikidataBatchShared = errors.New("wikidata: the shared query failed")

type wikidataRiderError struct{ err error }

func (e *wikidataRiderError) Error() string { return e.err.Error() }
func (e *wikidataRiderError) Unwrap() []error {
	return []error{e.err, errWikidataBatchShared}
}

// wikidataBatch is one query in the making: titles join while it waits for its
// paced slot, and the list is fixed when the slot is granted.
type wikidataBatch struct {
	ids     []string
	classes map[string][]CallerClass
	closed  bool
	done    chan struct{}
	rows    map[string][]wikidataBinding
	err     error
	// counted is set by the first caller still waiting when the batch fails: it
	// carries the failure for health, and everyone after it is a rider.
	counted bool
	// waiting counts callers still waiting. The request is cancelled when it
	// reaches zero, so the batch never outlives the callers it is for.
	waiting int
	cancel  context.CancelFunc
}

func (b *wikidataBatch) bestClass() CallerClass {
	best := CallerBulk
	for _, cs := range b.classes {
		for _, c := range cs {
			if c == CallerInteractive {
				return CallerInteractive
			}
			if c == CallerUnknown {
				best = CallerUnknown
			}
		}
	}
	return best
}

type wikidataBatcher struct {
	w    *Wikidata
	max  int
	mu   sync.Mutex
	open *wikidataBatch
}

func newWikidataBatcher(w *Wikidata, size int) *wikidataBatcher {
	b := &wikidataBatcher{w: w, max: size}
	if t, ok := w.httpClient.Transport.(*throttledTransport); ok {
		next := t.base
		if next == nil {
			next = http.DefaultTransport
		}
		t.base = &wikidataBatchTransport{batcher: b, next: next}
	}
	return b
}

func (bt *wikidataBatcher) pacer() *pacer {
	if t, ok := bt.w.httpClient.Transport.(*throttledTransport); ok {
		return t.pacer
	}
	return nil
}

// fetch joins the open batch, or opens one, and waits for this title's rows. A
// caller waits no longer than its own class may queue for a slot: a sweep that
// rode in on a person's batch still leaves at the sweep's limit.
func (bt *wikidataBatcher) fetch(ctx context.Context, imdbID string) (*MediaMeta, error) {
	class := CallerClassFrom(ctx)
	bt.mu.Lock()
	b, opened := bt.open, false
	if b == nil || b.closed || (len(b.ids) >= bt.max && b.classes[imdbID] == nil) {
		b = &wikidataBatch{classes: map[string][]CallerClass{}, done: make(chan struct{})}
		bt.open, opened = b, true
	}
	if b.classes[imdbID] == nil {
		b.ids = append(b.ids, imdbID)
	}
	b.classes[imdbID] = append(b.classes[imdbID], class)
	b.waiting++
	bt.mu.Unlock()
	defer bt.leave(b)
	if opened {
		go bt.run(ctx, b)
	}

	var limit <-chan time.Time
	var ceiling time.Duration
	if p := bt.pacer(); p != nil && p.maxWait > 0 {
		ceiling = bulkMaxWait(class, p.maxWait, p.interval)
		timer := time.NewTimer(ceiling + bt.w.httpClient.Timeout)
		defer timer.Stop()
		limit = timer.C
	}
	started := time.Now()
	select {
	case <-b.done:
	case <-ctx.Done():
		return nil, fmt.Errorf("wikidata: %w", ctx.Err())
	case <-limit:
		return nil, &backlogReason{err: ErrPacerBacklog, paced: pacedByQueueCeiling, wait: time.Since(started), budget: ceiling}
	}
	if b.err != nil {
		bt.mu.Lock()
		first := !b.counted
		b.counted = true
		bt.mu.Unlock()
		if first {
			return nil, b.err
		}
		return nil, &wikidataRiderError{err: b.err}
	}
	return wikidataMeta(b.rows[imdbID]), nil
}

// leave counts a caller out, and cancels the request once nobody is waiting on it.
func (bt *wikidataBatcher) leave(b *wikidataBatch) {
	bt.mu.Lock()
	defer bt.mu.Unlock()
	b.waiting--
	if b.waiting <= 0 && b.cancel != nil {
		b.cancel()
	}
}

// run sends the batch once its slot comes up. The request carries the best class
// among the titles waiting, so a person who joins a sweep's batch is not refused
// for the sweep's shorter queue. A refusal by our own pacer is tried once more
// if someone has joined since under a better class.
func (bt *wikidataBatcher) run(callerCtx context.Context, b *wikidataBatch) {
	defer close(b.done)
	for attempt := 0; ; attempt++ {
		bt.mu.Lock()
		class := b.bestClass()
		bt.mu.Unlock()
		ctx, cancel := context.WithCancel(WithCallerClass(context.WithoutCancel(callerCtx), class))
		ctx = context.WithValue(ctx, wikidataBatchKey{}, b)
		bt.mu.Lock()
		b.cancel = cancel
		if b.waiting <= 0 {
			cancel()
		}
		bt.mu.Unlock()
		err := bt.send(ctx, b)
		cancel()
		if err == nil {
			return
		}
		bt.mu.Lock()
		retry := attempt == 0 && !b.closed && b.bestClass() != class && errors.Is(err, ErrPacerBacklog)
		if !retry {
			b.closed = true
			if bt.open == b {
				bt.open = nil
			}
			b.err = err
			bt.mu.Unlock()
			return
		}
		bt.mu.Unlock()
	}
}

func (bt *wikidataBatcher) send(ctx context.Context, b *wikidataBatch) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, bt.w.endpoint, nil)
	if err != nil {
		return fmt.Errorf("wikidata: %w", err)
	}
	req.Header.Set("Accept", "application/sparql-results+json")
	req.Header.Set("User-Agent", wikidataUserAgent())
	started := time.Now()
	res, err := bt.w.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("wikidata: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("wikidata: %s", res.Status)
	}
	var out wikidataResults
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return fmt.Errorf("wikidata: %w", err)
	}
	rows := map[string][]wikidataBinding{}
	for _, row := range out.Results.Bindings {
		rows[row.IMDb.Value] = append(rows[row.IMDb.Value], row)
	}
	b.rows = rows
	counts := map[string]int{}
	bt.mu.Lock()
	titles := len(b.ids)
	for _, cs := range b.classes {
		for _, c := range cs {
			counts[c.String()]++
		}
	}
	bt.mu.Unlock()
	slog.Default().InfoContext(ctx, "Asked Wikidata for several titles in one query",
		"titles", titles, "answered", len(rows), "interactive", counts["interactive"], "unknown", counts["unknown"],
		"bulk", counts["bulk"], "took_ms", time.Since(started).Milliseconds(), "wdqs_ms", res.Header.Get("x-first-solution-millis"))
	return nil
}

type wikidataBatchKey struct{}

// wikidataBatchTransport sits under the pacer and writes the query when the slot
// is granted, so every title that joined while the batch waited goes with it.
type wikidataBatchTransport struct {
	batcher *wikidataBatcher
	next    http.RoundTripper
}

func (t *wikidataBatchTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	b, ok := req.Context().Value(wikidataBatchKey{}).(*wikidataBatch)
	if !ok {
		return t.next.RoundTrip(req)
	}
	t.batcher.mu.Lock()
	b.closed = true
	if t.batcher.open == b {
		t.batcher.open = nil
	}
	ids := append([]string(nil), b.ids...)
	t.batcher.mu.Unlock()
	u, err := url.Parse(t.batcher.w.endpoint + "?format=json&query=" + url.QueryEscape(wikidataBatchQuery(ids)))
	if err != nil {
		return nil, err
	}
	out := req.Clone(req.Context())
	out.URL, out.Host = u, u.Host
	return t.next.RoundTrip(out)
}
