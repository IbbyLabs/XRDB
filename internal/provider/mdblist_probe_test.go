package provider

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// userServer answers /user with each key's limit and records which keys asked.
type userServer struct {
	*httptest.Server
	mu   sync.Mutex
	seen []string
}

func newUserServer(t *testing.T, handler func(w http.ResponseWriter, key string)) *userServer {
	t.Helper()
	u := &userServer{}
	u.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.URL.Query().Get("apikey")
		u.mu.Lock()
		u.seen = append(u.seen, key)
		u.mu.Unlock()
		if r.URL.Path != "/user" {
			http.NotFound(w, r)
			return
		}
		handler(w, key)
	}))
	t.Cleanup(u.Close)
	return u
}

func (u *userServer) asked() []string {
	u.mu.Lock()
	defer u.mu.Unlock()
	return append([]string(nil), u.seen...)
}

func probeFixture(srv *userServer, keys string) (*MDBList, *dailyBudget) {
	m := &MDBList{keys: newKeyRing(keys), baseURL: srv.URL, httpClient: srv.Client()}
	b := newDailyBudget("mdblist", 10_000, 0)
	b.setRing(fingerprintsOf(m.keys.all()))
	return m, b
}

func fingerprintsOf(keys []string) []string {
	out := make([]string, len(keys))
	for i, k := range keys {
		out[i] = keyFingerprint(k)
	}
	return out
}

func headerLimit(limits map[string]string) func(http.ResponseWriter, string) {
	return func(w http.ResponseWriter, key string) {
		w.Header().Set("X-RateLimit-Limit", limits[key])
		_, _ = w.Write([]byte(`{}`))
	}
}

func TestProbeSetsAnUnseenKeysLimit(t *testing.T) {
	srv := newUserServer(t, headerLimit(map[string]string{"key-a": "10000", "key-b": "50000"}))
	m, b := probeFixture(srv, "key-a,key-b")
	b.setLimit(keyFingerprint("key-a"), 10_000)
	if b.limit != 20_000 {
		t.Fatalf("limit = %d, want 20000 projected before the probe", b.limit)
	}

	m.probeKeys(t.Context(), b)

	if b.limit != 60_000 {
		t.Errorf("limit = %d, want 60000 once the second key is measured", b.limit)
	}
	if got := srv.asked(); len(got) != 1 || got[0] != "key-b" {
		t.Errorf("probed %v, want only the key that had not answered", got)
	}
}

func TestProbeReadsTheBodyWhenNoHeaderComes(t *testing.T) {
	srv := newUserServer(t, func(w http.ResponseWriter, _ string) {
		_, _ = w.Write([]byte(`{"api_requests":25000,"api_requests_count":12,"rate_limit":25000}`))
	})
	m, b := probeFixture(srv, "key-a,key-b")

	m.probeKeys(t.Context(), b)

	if b.limit != 50_000 {
		t.Errorf("limit = %d, want 50000 from two body limits of 25000", b.limit)
	}
}

func TestAFreshMeasurementSkipsTheProbe(t *testing.T) {
	srv := newUserServer(t, headerLimit(map[string]string{"key-a": "10000", "key-b": "50000"}))
	m, b := probeFixture(srv, "key-a,key-b")
	b.restoreLimits(map[string]dailyBudgetLimit{
		keyFingerprint("key-a"): {Limit: 10_000, At: time.Now().Add(-23 * time.Hour)},
		keyFingerprint("key-b"): {Limit: 50_000, At: time.Now().Add(-time.Hour)},
	})

	m.probeKeys(t.Context(), b)

	if got := srv.asked(); len(got) != 0 {
		t.Errorf("probed %v, want no calls for measurements under a day old", got)
	}
	if b.limit != 60_000 {
		t.Errorf("limit = %d, want the restored 60000", b.limit)
	}
}

func TestAStaleMeasurementIsProbedAgain(t *testing.T) {
	srv := newUserServer(t, headerLimit(map[string]string{"key-a": "10000", "key-b": "70000"}))
	m, b := probeFixture(srv, "key-a,key-b")
	b.restoreLimits(map[string]dailyBudgetLimit{
		keyFingerprint("key-a"): {Limit: 10_000, At: time.Now().Add(-time.Hour)},
		keyFingerprint("key-b"): {Limit: 50_000, At: time.Now().Add(-25 * time.Hour)},
	})

	m.probeKeys(t.Context(), b)

	if got := srv.asked(); len(got) != 1 || got[0] != "key-b" {
		t.Errorf("probed %v, want only the stale key", got)
	}
	if b.limit != 80_000 {
		t.Errorf("limit = %d, want 80000 with the stale key re-measured", b.limit)
	}
}

func TestAFailedProbeLeavesTheProjection(t *testing.T) {
	srv := newUserServer(t, func(w http.ResponseWriter, _ string) {
		http.Error(w, "down", http.StatusInternalServerError)
	})
	m, b := probeFixture(srv, "key-a,key-b")
	b.setLimit(keyFingerprint("key-a"), 10_000)

	m.probeKeys(t.Context(), b)

	if b.limit != 20_000 {
		t.Errorf("limit = %d, want the 20000 projection kept", b.limit)
	}
	if !b.needsProbe(keyFingerprint("key-b")) {
		t.Error("a failed key was recorded as measured, so it would never be retried")
	}
}

func TestASingleKeyRingMakesNoProbe(t *testing.T) {
	srv := newUserServer(t, headerLimit(map[string]string{"key-a": "10000"}))
	m, b := probeFixture(srv, "key-a")

	m.probeKeys(t.Context(), b)

	if got := srv.asked(); len(got) != 0 {
		t.Errorf("probed %v, want no calls for a one-key ring", got)
	}
}

func TestMeasuredLimitsSurviveASaveAndDropRemovedKeys(t *testing.T) {
	b := newDailyBudget("mdblist", 10_000, 0)
	b.setRing([]string{"aaa", "bbb"})
	b.setLimit("aaa", 10_000)
	b.setLimit("bbb", 50_000)

	data, err := json.Marshal(dailyBudgetSnapshot{Shape: dailyBudgetShape,
		Limits: map[string]map[string]dailyBudgetLimit{"mdblist": b.snapshotLimits()}})
	if err != nil {
		t.Fatal(err)
	}
	var snap dailyBudgetSnapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		t.Fatal(err)
	}

	next := newDailyBudget("mdblist", 10_000, 0)
	next.setRing([]string{"aaa", "ccc"})
	if n := next.restoreLimits(snap.Limits["mdblist"]); n != 1 {
		t.Errorf("restored %d, want 1: bbb left the ring", n)
	}
	if _, kept := next.observedLimits["bbb"]; kept {
		t.Error("a key that left the ring was restored")
	}
	if next.needsProbe("aaa") {
		t.Error("a restored fresh limit still wants a probe")
	}
	if !next.needsProbe("ccc") {
		t.Error("a new key with no stored limit does not want a probe")
	}
}

func TestChangingTheRingDropsAKeysLimit(t *testing.T) {
	b := newDailyBudget("mdblist", 10_000, 0)
	b.setRing([]string{"aaa", "bbb"})
	b.setLimit("aaa", 10_000)
	b.setLimit("bbb", 50_000)

	b.setRing([]string{"aaa", "ccc"})

	if _, kept := b.observedLimits["bbb"]; kept {
		t.Error("the removed key's limit is still counted")
	}
	if b.limit != 20_000 {
		t.Errorf("limit = %d, want 20000: aaa plus ccc projected at aaa", b.limit)
	}
}

// A file written before limits existed must still load and resume the count.
func TestAFileWithoutLimitsStillLoads(t *testing.T) {
	dir := t.TempDir()
	today := time.Now().UTC().Truncate(dailyWindow).Format(time.RFC3339)
	writeSnapshot(t, filepath.Join(dir, dailyBudgetFile),
		`{"shape":1,"day":"`+today+`","spent":{"simkl":123}}`)

	b := dailyBudgetFor("simkl")
	t.Cleanup(func() {
		b.mu.Lock()
		b.spent, b.day = 0, time.Time{}
		b.mu.Unlock()
		dailyBudgetPath.mu.Lock()
		dailyBudgetPath.path = ""
		dailyBudgetPath.mu.Unlock()
	})
	SetDailyBudgetPath(dir, quietProviderLogger())

	b.mu.Lock()
	spent := b.spent
	b.mu.Unlock()
	if spent != 123 {
		t.Errorf("spent = %d, want 123 resumed from a file with no limits field", spent)
	}
	if _, err := os.Stat(filepath.Join(dir, dailyBudgetFile)); err != nil {
		t.Fatal(err)
	}
}

func TestALimitForAKeyThatLeftTheRingIsDropped(t *testing.T) {
	b := newDailyBudget("mdblist", 10_000, 0)
	b.setRing([]string{keyFingerprint("a"), keyFingerprint("b")})
	b.setLimit(keyFingerprint("a"), 1000)
	b.setRing([]string{keyFingerprint("a"), keyFingerprint("c")})
	b.setLimit(keyFingerprint("b"), 1_000_000)
	b.mu.Lock()
	_, kept := b.observedLimits[keyFingerprint("b")]
	b.mu.Unlock()
	if kept {
		t.Error("a probe answering after its key left the ring was recorded")
	}
	b.setLimit(keyFingerprint("c"), 2000)
	b.mu.Lock()
	got := b.observedLimits[keyFingerprint("c")]
	b.mu.Unlock()
	if got != 2000 {
		t.Errorf("a key in the ring was not recorded: got %d", got)
	}
}
