package provider

import (
	"net/url"
	"testing"
)

// The sweep reserve is held against what the whole ring may spend. spent counts
// every key's calls together, so measuring it against whichever key answered
// last means a second key buys a sweep no headroom at all.

func TestASecondKeyRaisesTheSweepCutOff(t *testing.T) {
	b := newDailyBudget("mdblist", 10_000, 4_000)
	b.reservePct = 40
	b.setRingSize(2)
	b.setLimit("key-a", 10_000)

	if b.limit != 20_000 {
		t.Fatalf("limit = %d, want 20000 for two keys of 10000", b.limit)
	}
	if b.reserve != 8_000 {
		t.Errorf("reserve = %d, want 8000, 40%% of the ring", b.reserve)
	}

	// The cut-off is limit - reserve. One key put it at 6,000.
	for i := 0; i < 11_999; i++ {
		b.spend()
	}
	if !b.allowsBulk() {
		t.Errorf("sweeps held at %d spent; two keys of 10000 should reach 12000", b.spent)
	}
}

// The control. Without the ring size the projection has nothing to project, so
// one key behaves exactly as it did before.
func TestOneKeyIsUnchanged(t *testing.T) {
	b := newDailyBudget("mdblist", 10_000, 4_000)
	b.reservePct = 40
	b.setRingSize(1)
	b.setLimit("key-a", 10_000)

	if b.limit != 10_000 {
		t.Fatalf("limit = %d, want 10000", b.limit)
	}
	for i := 0; i < 6_000; i++ {
		b.spend()
	}
	if b.allowsBulk() {
		t.Errorf("sweeps still allowed at %d spent, want held from 6000", b.spent)
	}
}

// An unseen key is projected at the smallest limit seen, never the largest. The
// ring reaches a key only once the ones before it are spent, so the second plan
// is usually unknown when it matters, and guessing high overruns the reserve on
// the last key, which is where an interactive caller loses the source outright.
func TestAnUnseenKeyIsProjectedAtTheSmallestPlan(t *testing.T) {
	b := newDailyBudget("mdblist", 1_000, 0)
	b.setRingSize(3)
	b.setLimit("small", 1_000)
	b.setLimit("large", 50_000)

	// 1000 + 50000 seen, one unseen projected at the smaller of the two.
	if b.limit != 52_000 {
		t.Errorf("limit = %d, want 52000: 51000 seen plus 1000 projected", b.limit)
	}
}

// Every key answering means no projection is left, so the total is exact and a
// mixed-plan ring is priced correctly rather than approximated.
func TestAFullyObservedRingIsExact(t *testing.T) {
	b := newDailyBudget("mdblist", 1_000, 0)
	b.setRingSize(2)
	b.setLimit("small", 1_000)
	b.setLimit("large", 50_000)

	if b.limit != 51_000 {
		t.Errorf("limit = %d, want 51000 with both keys seen", b.limit)
	}
}

// The credential is not held. A budget keyed on the secret puts it somewhere a
// struct dump or a stray log line can reach.
func TestTheBudgetDoesNotHoldTheCredential(t *testing.T) {
	secret := "mdb_live_do_not_store_me"
	if got := keyFingerprint(secret); got == secret || got == "" {
		t.Fatalf("fingerprint = %q, want a short digest that is not the key", got)
	}
	if keyFingerprint(secret) != keyFingerprint(secret) {
		t.Errorf("fingerprint is not stable for one key")
	}
	if keyFingerprint("a") == keyFingerprint("b") {
		t.Errorf("two keys share a fingerprint")
	}
}

// SIMKL carries its credential as client_id where MDBList uses apikey. A
// transport that looks for one name only leaves the other source on a single
// key's limit, which is this bug surviving in the place nobody looked.
func TestEachSourcesCredentialParameterIsRead(t *testing.T) {
	for _, tc := range []struct {
		source, raw, want string
	}{
		{"mdblist", "https://x/?apikey=abc&i=tt1", "abc"},
		{"simkl", "https://x/?client_id=def&imdb=tt1", "def"},
		{"simkl", "https://x/?apikey=def", ""},
		{"mdblist", "https://x/?client_id=def", ""},
		{"omdb", "https://x/?apikey=abc", ""},
	} {
		u, err := url.Parse(tc.raw)
		if err != nil {
			t.Fatalf("parse: %v", err)
		}
		if got := credentialFromRequest(tc.source, u); got != tc.want {
			t.Errorf("%s %s = %q, want %q", tc.source, tc.raw, got, tc.want)
		}
	}
	if got := credentialFromRequest("mdblist", nil); got != "" {
		t.Errorf("a nil URL returned %q", got)
	}
}
