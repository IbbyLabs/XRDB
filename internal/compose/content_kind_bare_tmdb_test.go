package compose

import (
	"context"
	"errors"
	"testing"

	"xrdb_rewrite/internal/provider"
)

// kindStub answers the bare-TMDB probe and counts how often it was asked.
type kindStub struct {
	provider.StubProvider
	kind     string
	err      error
	calls    int
	notReady bool
}

func (k *kindStub) Ready() bool { return !k.notReady }

func (k *kindStub) KindOfTMDBID(context.Context, string) (string, error) {
	k.calls++
	return k.kind, k.err
}

func kindPipeline(stub *kindStub) *Pipeline {
	stub.ProviderName = "tmdb"
	reg := provider.NewRegistry()
	reg.Register(stub)
	return &Pipeline{providers: reg}
}

func TestABareTMDBIDIsResolvedForAPerTypeOverride(t *testing.T) {
	stub := &kindStub{kind: "series"}
	p := kindPipeline(stub)
	if got := p.resolveContentKind(context.Background(), Request{MediaID: "tmdb:1399"}); got != "series" {
		t.Errorf("kind %q, want series", got)
	}
	if stub.calls != 1 {
		t.Errorf("asked %d times, want once", stub.calls)
	}
}

// The kinds that are written into the id settle it without a call. Paying for a
// probe on an id that already says "movie" is the cost this is gated to avoid.
func TestAnIDThatNamesItsKindIsNotProbed(t *testing.T) {
	for _, id := range []string{"tmdb:movie:550", "tmdb:tv:1399", "series:tmdb:1399", "tt0111161"} {
		stub := &kindStub{kind: "movie"}
		kindPipeline(stub).resolveContentKind(context.Background(), Request{MediaID: id})
		if stub.calls != 0 {
			t.Errorf("%s went to TMDB", id)
		}
	}
}

// An unresolvable id leaves the kind empty, which is what the config already
// falls through on, so a failed probe is never worse than not probing.
func TestAFailedProbeLeavesTheKindEmpty(t *testing.T) {
	stub := &kindStub{err: errors.New("tmdb: nope")}
	if got := kindPipeline(stub).resolveContentKind(context.Background(), Request{MediaID: "tmdb:99999999"}); got != "" {
		t.Errorf("kind %q, want empty", got)
	}
}

// A source we have decided not to talk to must not be handed two doomed calls
// per title.
func TestAHeldOutTMDBIsNotProbed(t *testing.T) {
	stub := &kindStub{kind: "movie"}
	stub.ProviderName = "tmdb"
	stub.notReady = true
	reg := provider.NewRegistry()
	reg.Register(stub)
	p := &Pipeline{providers: reg}
	if got := p.resolveContentKind(context.Background(), Request{MediaID: "tmdb:550"}); got != "" {
		t.Errorf("kind %q, want empty", got)
	}
	if stub.calls != 0 {
		t.Error("probed a provider that is not ready")
	}
}
