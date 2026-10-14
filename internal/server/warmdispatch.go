package server

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"sync"
)

type warmRequestKey struct{}

// withWarm marks a request the cache warmer dispatches in-process.
func withWarm(ctx context.Context) context.Context {
	return context.WithValue(ctx, warmRequestKey{}, true)
}

// isWarmRequest reports a request the cache warmer dispatched. Only the warmer
// can set it; nothing on the wire reaches it.
func isWarmRequest(ctx context.Context) bool {
	v, _ := ctx.Value(warmRequestKey{}).(bool)
	return v
}

// warmRun is how a warm pass renders: through the handler for artwork URLs
// that are render routes, by id with the resolved profile for the rest.
type warmRun struct {
	dispatch http.Handler
	apiKey   string
	resolve  func(surface string) (warmTarget, error)
}

// warmRenderPath returns the path and query of raw when it is a render route
// for surface, looking once inside a proxy URL's url parameter. The host is
// ignored: the path is dispatched in-process and never fetched.
func warmRenderPath(raw, surface string) (string, bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || raw == "" {
		return "", false
	}
	if p, ok := renderRoute(u, surface); ok {
		return p, true
	}
	inner := u.Query().Get("url")
	if inner == "" {
		return "", false
	}
	iu, err := url.Parse(inner)
	if err != nil {
		return "", false
	}
	return renderRoute(iu, surface)
}

func renderRoute(u *url.URL, surface string) (string, bool) {
	id, ok := strings.CutPrefix(u.EscapedPath(), "/"+surface+"/")
	if !ok || id == "" || strings.Contains(id, "/") {
		return "", false
	}
	p := u.EscapedPath()
	if u.RawQuery != "" {
		p += "?" + u.RawQuery
	}
	return p, true
}

// warmByURL renders each path through h, four at a time, and returns how many
// answered with artwork.
func warmByURL(ctx context.Context, h http.Handler, apiKey string, paths []string) (served, failed int) {
	const concurrency = 4
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, concurrency)
	for _, p := range paths {
		if ctx.Err() != nil {
			break
		}
		sem <- struct{}{}
		wg.Add(1)
		go func(p string) {
			defer func() { <-sem; wg.Done() }()
			ok := dispatchWarm(ctx, h, apiKey, p)
			mu.Lock()
			if ok {
				served++
			} else {
				failed++
			}
			mu.Unlock()
		}(p)
	}
	wg.Wait()
	return served, failed
}

func dispatchWarm(ctx context.Context, h http.Handler, apiKey, path string) bool {
	req, err := http.NewRequestWithContext(withWarm(ctx), http.MethodGet, path, nil)
	if err != nil {
		return false
	}
	req.RemoteAddr = "127.0.0.1:0"
	req.RequestURI = path
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}
	w := &discardWriter{header: http.Header{}}
	h.ServeHTTP(w, req)
	return w.status == 0 || w.status < http.StatusBadRequest
}

// discardWriter keeps the status of a warm render and drops its bytes.
type discardWriter struct {
	header http.Header
	status int
}

func (w *discardWriter) Header() http.Header { return w.header }
func (w *discardWriter) WriteHeader(code int) {
	if w.status == 0 {
		w.status = code
	}
}
func (w *discardWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return len(b), nil
}
