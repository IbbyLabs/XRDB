package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func withMode(t *testing.T, mode string, batch int) {
	t.Helper()
	wasMode, wasBatch := keyMode, keyBatch
	keyMode, keyBatch = mode, batch
	t.Cleanup(func() { keyMode, keyBatch = wasMode, wasBatch })
}

func TestFillPicksTheFirstKeyEveryTime(t *testing.T) {
	withMode(t, rotateFill, 1)
	r := newKeyRing("a,b,c")
	for i := 0; i < 4; i++ {
		if got := r.pick(); got != "a" {
			t.Fatalf("pick %d = %q, want a", i, got)
		}
	}
}

func TestSpreadTakesTurnsAcrossTheRing(t *testing.T) {
	withMode(t, rotateTurns, 1)
	r := newKeyRing("a,b,c")
	var got []string
	for i := 0; i < 6; i++ {
		got = append(got, r.pick())
	}
	want := []string{"a", "b", "c", "a", "b", "c"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("picks = %v, want %v", got, want)
		}
	}
}

func TestSpreadSkipsASpentKey(t *testing.T) {
	withMode(t, rotateTurns, 1)
	r := newKeyRing("a,b,c")
	r.markSpent("b")
	for i := 0; i < 6; i++ {
		if got := r.pick(); got == "b" {
			t.Fatalf("pick %d returned the spent key", i)
		}
	}
}

func TestSpreadWithEveryKeySpentStillCalls(t *testing.T) {
	withMode(t, rotateTurns, 1)
	r := newKeyRing("a,b")
	r.markSpent("a")
	r.markSpent("b")
	if got := r.pick(); got == "" {
		t.Fatal("a fully spent ring returned nothing to call")
	}
}

// current is what the existence checks read, so it must not move the ring.
func TestCurrentDoesNotAdvanceASpreadRing(t *testing.T) {
	withMode(t, rotateTurns, 1)
	r := newKeyRing("a,b")
	r.current()
	r.current()
	if got := r.pick(); got != "a" {
		t.Errorf("pick = %q after two current calls, want a", got)
	}
}

func TestSpreadTakesTurnsAcrossAnOwnersList(t *testing.T) {
	withMode(t, rotateTurns, 1)
	ctx := WithKeys(context.Background(), map[string]string{KeyMDBList: "own1,own2"})
	seen := map[string]int{}
	for i := 0; i < 10; i++ {
		seen[keyForRequest(ctx, KeyMDBList)]++
	}
	if seen["own1"] != 5 || seen["own2"] != 5 {
		t.Errorf("owner picks = %v, want five each", seen)
	}
	if got := keyFrom(ctx, KeyMDBList); got != "own1" {
		t.Errorf("keyFrom = %q, want own1: the existence check must not rotate", got)
	}
}

func TestFillKeepsAnOwnersListOnItsFirstKey(t *testing.T) {
	withMode(t, rotateFill, 1)
	ctx := WithKeys(context.Background(), map[string]string{KeyMDBList: "own1,own2"})
	for i := 0; i < 3; i++ {
		if got := keyForRequest(ctx, KeyMDBList); got != "own1" {
			t.Fatalf("pick %d = %q, want own1", i, got)
		}
	}
}

func TestSpreadSkipsAnOwnersSpentKey(t *testing.T) {
	withMode(t, rotateTurns, 1)
	ctx := WithKeys(context.Background(), map[string]string{KeyOMDB: "spentown,liveown"})
	noteOwnerKeySpent(ctx, KeyOMDB, "spentown")
	t.Cleanup(func() {
		ownerSpent.mu.Lock()
		delete(ownerSpent.at, "spentown")
		ownerSpent.mu.Unlock()
	})
	for i := 0; i < 4; i++ {
		if got := keyForRequest(ctx, KeyOMDB); got != "liveown" {
			t.Fatalf("pick %d = %q, want liveown", i, got)
		}
	}
}

func TestReadKeyMode(t *testing.T) {
	for raw, want := range map[string]string{"": "fill", "fill": "fill", " TURNS ": "turns", "random": "random", "roundrobin": "fill"} {
		t.Setenv("XRDB_KEY_ROTATION", raw)
		if got := readKeyMode(); got != want {
			t.Errorf("XRDB_KEY_ROTATION=%q gave %q, want %q", raw, got, want)
		}
	}
}

func TestTurnsServeABatchPerKey(t *testing.T) {
	withMode(t, rotateTurns, 3)
	r := newKeyRing("a,b")
	var got string
	for i := 0; i < 8; i++ {
		got += r.pick()
	}
	if got != "aaabbbaa" {
		t.Errorf("picks = %q, want aaabbbaa", got)
	}
}

// A key refused mid-batch hands over at once rather than serving out the batch.
func TestASpentKeyEndsItsBatch(t *testing.T) {
	withMode(t, rotateTurns, 10)
	r := newKeyRing("a,b")
	r.pick()
	r.markSpent("a")
	if got := r.pick(); got != "b" {
		t.Errorf("pick after a was spent = %q, want b", got)
	}
}

func TestRandomChangesKeyEveryBatchAndReachesThemAll(t *testing.T) {
	withMode(t, rotateRandom, 2)
	r := newKeyRing("a,b,c,d")
	seen := map[string]int{}
	prev := ""
	for batch := 0; batch < 400; batch++ {
		first := r.pick()
		if second := r.pick(); second != first {
			t.Fatalf("batch %d split across %q and %q", batch, first, second)
		}
		if first == prev {
			t.Fatalf("batch %d repeated %q", batch, first)
		}
		prev = first
		seen[first]++
	}
	for _, k := range []string{"a", "b", "c", "d"} {
		if seen[k] < 60 {
			t.Errorf("key %s led %d of 400 batches: %v", k, seen[k], seen)
		}
	}
}

func TestRandomReachesEveryKeyInAnOwnersList(t *testing.T) {
	withMode(t, rotateRandom, 1)
	ctx := WithKeys(context.Background(), map[string]string{KeySIMKL: "o1,o2,o3"})
	seen := map[string]int{}
	for i := 0; i < 300; i++ {
		seen[keyForRequest(ctx, KeySIMKL)]++
	}
	for _, k := range []string{"o1", "o2", "o3"} {
		if seen[k] < 50 {
			t.Errorf("owner key %s picked %d of 300: %v", k, seen[k], seen)
		}
	}
}

// Drives MDBList itself, so a call site still reading the non-rotating key fails.
func TestSpreadReachesMDBListRequests(t *testing.T) {
	withMode(t, rotateTurns, 1)
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.Query().Get("apikey"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"title":"x","ratings":[]}`))
	}))
	defer srv.Close()

	m := &MDBList{keys: newKeyRing("k1,k2"), httpClient: srv.Client(), baseURL: srv.URL}
	for i := 0; i < 4; i++ {
		_, _ = m.fetchType(context.Background(), "movie", "tt1234567")
	}
	want := []string{"k1", "k2", "k1", "k2"}
	if len(seen) != len(want) {
		t.Fatalf("requests = %v, want %v", seen, want)
	}
	for i := range want {
		if seen[i] != want[i] {
			t.Fatalf("keys sent = %v, want %v", seen, want)
		}
	}
}
