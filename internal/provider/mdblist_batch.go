package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"xrdb_rewrite/internal/logging"
)

// mdblistBatchSize is how many titles one batch request may carry. MDBList bills
// a batch as one request whatever it holds; 1 turns batching off.
func mdblistBatchSize() int {
	return envInt("XRDB_MDBLIST_BATCH", 50, 1, 200)
}

// mdblistBatchWindow is how long a batch waits for more titles before it is sent.
func mdblistBatchWindow() time.Duration {
	return time.Duration(envInt("XRDB_MDBLIST_BATCH_WINDOW_MS", 250, 0, 5000)) * time.Millisecond
}

// errMDBListBatchShared marks a failure a caller received because the batch it
// rode in failed; the first caller still waiting carries it for health.
var errMDBListBatchShared = errors.New("mdblist: the shared batch failed")

type mdblistRiderError struct{ err error }

func (e *mdblistRiderError) Error() string { return e.err.Error() }
func (e *mdblistRiderError) Unwrap() []error {
	return []error{e.err, errMDBListBatchShared}
}

type mdblistBatchItem struct {
	mdblistPayload
	Type string `json:"type"`
	IDs  struct {
		IMDb string `json:"imdb"`
	} `json:"ids"`
}

type mdblistBatch struct {
	ids     []string
	seen    map[string]bool
	unknown bool
	closed  bool
	full    chan struct{}
	done    chan struct{}
	items   map[string]mdblistPayload
	err     error
	counted bool
	waiting int
	cancel  context.CancelFunc
}

type mdblistBatcher struct {
	m      *MDBList
	max    int
	window time.Duration
	mu     sync.Mutex
	open   *mdblistBatch
}

func newMDBListBatcher(m *MDBList, size int, window time.Duration) *mdblistBatcher {
	return &mdblistBatcher{m: m, max: size, window: window}
}

// batches reports whether this call goes in a batch: sweeps on the server's own
// keys only. An owner's key may be on a plan with a smaller batch allowance.
func (bt *mdblistBatcher) batches(ctx context.Context) bool {
	return bt != nil && bt.max > 1 && TreatedAsBulk(CallerClassFrom(ctx)) && !HasOwnerKey(ctx, KeyMDBList)
}

func (bt *mdblistBatcher) fetch(ctx context.Context, imdbID string) (*MediaMeta, error) {
	bt.mu.Lock()
	b, opened := bt.open, false
	if b == nil || b.closed || (len(b.ids) >= bt.max && !b.seen[imdbID]) {
		b = &mdblistBatch{seen: map[string]bool{}, full: make(chan struct{}), done: make(chan struct{})}
		bt.open, opened = b, true
	}
	if !b.seen[imdbID] {
		b.seen[imdbID] = true
		b.ids = append(b.ids, imdbID)
		if len(b.ids) == bt.max {
			close(b.full)
		}
	}
	if CallerClassFrom(ctx) == CallerUnknown {
		b.unknown = true
	}
	b.waiting++
	bt.mu.Unlock()
	defer bt.leave(b)
	if opened {
		go bt.run(ctx, b)
	}

	select {
	case <-b.done:
	case <-ctx.Done():
		return nil, fmt.Errorf("mdblist: %w", ctx.Err())
	}
	if b.err != nil {
		bt.mu.Lock()
		first := !b.counted
		b.counted = true
		bt.mu.Unlock()
		if first {
			return nil, b.err
		}
		return nil, &mdblistRiderError{err: b.err}
	}
	p, ok := b.items[imdbID]
	if !ok {
		return nil, fmt.Errorf("mdblist: %q not found: %w", imdbID, errNotFound)
	}
	return mdblistMeta(p), nil
}

func (bt *mdblistBatcher) leave(b *mdblistBatch) {
	bt.mu.Lock()
	defer bt.mu.Unlock()
	b.waiting--
	if b.waiting <= 0 && b.cancel != nil {
		b.cancel()
	}
}

// run holds the batch open for the window, or until it is full, then sends it.
func (bt *mdblistBatcher) run(callerCtx context.Context, b *mdblistBatch) {
	defer close(b.done)
	if bt.window > 0 {
		timer := time.NewTimer(bt.window)
		select {
		case <-timer.C:
		case <-b.full:
			timer.Stop()
		}
	}
	bt.mu.Lock()
	b.closed = true
	if bt.open == b {
		bt.open = nil
	}
	ids := append([]string(nil), b.ids...)
	class := CallerBulk
	if b.unknown {
		class = CallerUnknown
	}
	ctx, cancel := context.WithCancel(WithCallerClass(context.WithoutCancel(callerCtx), class))
	b.cancel = cancel
	if b.waiting <= 0 {
		cancel()
	}
	bt.mu.Unlock()
	defer cancel()
	b.items, b.err = bt.send(ctx, ids)
}

func (bt *mdblistBatcher) send(ctx context.Context, ids []string) (map[string]mdblistPayload, error) {
	m := bt.m
	base := mdblistBase
	if m.baseURL != "" {
		base = m.baseURL
	}
	used := m.pick(ctx)
	body, err := json.Marshal(map[string][]string{"ids": ids})
	if err != nil {
		return nil, fmt.Errorf("mdblist: %w", err)
	}
	endpoint := base + "/imdb/any?" + url.Values{"apikey": {used}}.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	started := time.Now()
	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("mdblist: batch request: %w: %w", redactHTTPErr(err), errHostUnreachable)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusTooManyRequests, http.StatusServiceUnavailable:
		return nil, m.refusal(ctx, resp, used)
	case http.StatusUnauthorized, http.StatusForbidden:
		return nil, fmt.Errorf("mdblist: unauthorized (check api key): %w", HTTPFault("mdblist", resp.StatusCode))
	}
	if resp.StatusCode >= 500 {
		return nil, fmt.Errorf("%w: %w", HTTPFault("mdblist", resp.StatusCode), errHostUnreachable)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, HTTPFault("mdblist", resp.StatusCode)
	}
	var out []mdblistBatchItem
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("mdblist: decode batch response: %w", err)
	}
	items := make(map[string]mdblistPayload, len(out))
	for _, it := range out {
		if it.IDs.IMDb == "" {
			continue
		}
		items[it.IDs.IMDb] = it.mdblistPayload
		if it.Type == "movie" || it.Type == "show" {
			m.knownType.Store(it.IDs.IMDb, it.Type)
		}
	}
	m.log().InfoContext(ctx, "Asked MDBList for several titles in one request",
		"id", logging.RequestID(ctx), "titles", len(ids), "answered", len(items),
		"took_ms", time.Since(started).Milliseconds())
	return items, nil
}

func mdblistMeta(p mdblistPayload) *MediaMeta {
	return &MediaMeta{
		Ratings:       parseMDBListRatings(p),
		ContentRating: commonSenseAge(p),
		Awards:        ParseAwards(p.Awards),
	}
}
