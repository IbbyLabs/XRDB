package compose

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// A render the viewer walked away from must not count against the source. The
// guard cannot read the returned error: when the HTTP client's timer fires at
// the same moment the context is cancelled, Go returns an error that satisfies
// DeadlineExceeded while the text still says "canceled". Five of those trip the
// failure breaker and take a working source off every poster.
func TestAnAbandonedRenderDoesNotCountAgainstTheSource(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 50 * time.Millisecond}
	var abandoned error
	var abandonedCtx context.Context
	// Race the cancellation against the client timer until the shape that
	// defeats an error-only guard comes up.
	for i := range 40 {
		ctx, cancel := context.WithCancel(context.Background())
		time.AfterFunc(time.Duration(48+i%5)*time.Millisecond, cancel)
		req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL, nil)
		_, err := client.Do(req)
		if err != nil && ctx.Err() != nil && !errors.Is(err, context.Canceled) {
			abandoned, abandonedCtx = err, ctx
			cancel()
			break
		}
		cancel()
	}
	if abandoned == nil {
		t.Skip("could not produce a cancellation racing the client timeout on this machine")
	}

	if recordsAgainstTheSource(abandonedCtx, abandoned) {
		t.Errorf("an abandoned render was recorded against the source: %v", abandoned)
	}
}

// A source that is genuinely too slow is a source failing us, and holding it out
// is the point of the breaker. The guard must not swallow that too.
func TestASlowSourceStillCountsAgainstIt(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer srv.Close()

	client := &http.Client{Timeout: 20 * time.Millisecond}
	req, _ := http.NewRequestWithContext(context.Background(), "GET", srv.URL, nil)
	_, err := client.Do(req)
	if err == nil {
		t.Fatal("the request did not time out")
	}
	if !recordsAgainstTheSource(context.Background(), err) {
		t.Errorf("a source that timed out with a live render context was not recorded against: %v", err)
	}
}

func TestAPlainCancellationDoesNotCountAgainstTheSource(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if recordsAgainstTheSource(ctx, context.Canceled) {
		t.Error("a cancelled render was recorded against the source")
	}
}

func TestAnOrdinaryFailureCountsAgainstTheSource(t *testing.T) {
	if !recordsAgainstTheSource(context.Background(), errors.New("http 504")) {
		t.Error("an ordinary failure was not recorded against the source")
	}
}
