package provider

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestOneKeyIsAlwaysTheCurrentOne(t *testing.T) {
	r := newKeyRing("solo")
	if got := r.current(); got != "solo" {
		t.Fatalf("current = %q", got)
	}
	r.markSpent("solo")
	if got := r.current(); got != "solo" {
		t.Errorf("a ring of one left nothing to call: %q", got)
	}
}

func TestASpentKeyMovesToTheNext(t *testing.T) {
	r := newKeyRing(" first , second ,, third ")
	if got := r.size(); got != 3 {
		t.Fatalf("size = %d, want 3 (empty entries dropped)", got)
	}
	if got := r.current(); got != "first" {
		t.Fatalf("current = %q, want first", got)
	}

	r.markSpent("first")
	if got := r.current(); got != "second" {
		t.Errorf("current = %q, want second after first was spent", got)
	}
	r.markSpent("second")
	if got := r.current(); got != "third" {
		t.Errorf("current = %q, want third", got)
	}
}

// A source with every key spent must still be called: the alternative is a
// source that stays dead until a restart.
func TestEveryKeySpentStartsTheRingAgain(t *testing.T) {
	r := newKeyRing("a,b")
	r.markSpent("a")
	r.markSpent("b")

	if got := r.current(); got != "a" {
		t.Fatalf("current = %q, want a", got)
	}
	if len(r.spent) != 0 {
		t.Errorf("the marks survived the reset: %v", r.spent)
	}
}

func TestAMarkStopsApplyingOnceItIsOldEnough(t *testing.T) {
	r := newKeyRing("a,b")
	r.markSpent("a")
	r.spent["a"] = time.Now().Add(-keySpentFor - time.Minute)

	if got := r.current(); got != "a" {
		t.Errorf("current = %q, want a once the mark aged out", got)
	}
}

func TestReplacingTheKeysKeepsAMarkOnlyForAKeyThatSurvived(t *testing.T) {
	r := newKeyRing("a,b")
	r.markSpent("a")

	r.set("a,c")

	if _, marked := r.spent["a"]; !marked {
		t.Error("a surviving key lost its mark, so a spent key is tried again at once")
	}
	if got := r.current(); got != "c" {
		t.Errorf("current = %q, want c", got)
	}
}

// Rotation is driven by a typed quota refusal, so the branch that sets it has
// to move the ring. The other two branches must not.
func TestMDBListRotatesOnlyWhenTheAllowanceIsSpent(t *testing.T) {
	for _, tc := range []struct {
		name      string
		remaining string
		wantNext  string
	}{
		{name: "allowance spent", remaining: "0", wantNext: "second"},
		{name: "allowance left", remaining: "12", wantNext: "first"},
		{name: "no header at all", remaining: "", wantNext: "first"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m := &MDBList{keys: newKeyRing("first,second")}
			h := http.Header{}
			if tc.remaining != "" {
				h.Set("X-RateLimit-Remaining", tc.remaining)
			}

			_ = m.refusal(context.Background(), &http.Response{
				StatusCode: http.StatusTooManyRequests, Header: h,
			}, "first")

			if got := m.keys.current(); got != tc.wantNext {
				t.Errorf("current = %q, want %q", got, tc.wantNext)
			}
		})
	}
}

// An owner's credential has its own allowance, so spending it says nothing
// about the server's and must not rotate the server's ring.
func TestAnOwnerKeyBeingSpentDoesNotMoveTheServerRing(t *testing.T) {
	m := &MDBList{keys: newKeyRing("first,second")}
	ctx := WithKeys(context.Background(), map[string]string{KeyMDBList: "theirs"})
	h := http.Header{}
	h.Set("X-RateLimit-Remaining", "0")

	_ = m.refusal(ctx, &http.Response{StatusCode: http.StatusTooManyRequests, Header: h}, "theirs")

	if got := m.keys.current(); got != "first" {
		t.Errorf("current = %q, want first", got)
	}
}

// A profile field holding several credentials is a list, and a single one is a
// list of one. Neither regex admits a comma, so a stored key cannot change
// meaning under this.
func TestAnOwnerKeyListRotatesForThatOwnerAlone(t *testing.T) {
	ctx := WithKeys(context.Background(), map[string]string{KeyMDBList: "theirs1,theirs2"})

	if got := keyFrom(ctx, KeyMDBList); got != "theirs1" {
		t.Fatalf("keyFrom = %q, want theirs1", got)
	}
	noteOwnerKeySpent(ctx, KeyMDBList, "theirs1")
	if got := keyFrom(ctx, KeyMDBList); got != "theirs2" {
		t.Errorf("keyFrom = %q, want theirs2 after the first was spent", got)
	}
}

func TestASingleOwnerKeyIsUnchanged(t *testing.T) {
	ctx := WithKeys(context.Background(), map[string]string{KeyOMDB: " solo "})

	if got := keyFrom(ctx, KeyOMDB); got != "solo" {
		t.Fatalf("keyFrom = %q, want solo", got)
	}
	// Nothing to rotate to, and no ring is created for it.
	noteOwnerKeySpent(ctx, KeyOMDB, "solo")
	if got := keyFrom(ctx, KeyOMDB); got != "solo" {
		t.Errorf("a single owner key stopped being served: %q", got)
	}
}

// An owner spending their own allowance says nothing about the server's.
func TestAnOwnerListDoesNotMoveTheServerRing(t *testing.T) {
	m := &MDBList{keys: newKeyRing("ours1,ours2")}
	ctx := WithKeys(context.Background(), map[string]string{KeyMDBList: "theirs1,theirs2"})
	h := http.Header{}
	h.Set("X-RateLimit-Remaining", "0")

	_ = m.refusal(ctx, &http.Response{StatusCode: http.StatusTooManyRequests, Header: h}, "theirs1")

	if got := m.keys.current(); got != "ours1" {
		t.Errorf("the server ring moved to %q on an owner's spent key", got)
	}
	if got := keyFrom(ctx, KeyMDBList); got != "theirs2" {
		t.Errorf("the owner's ring did not move: %q", got)
	}
}

// The length bound has to apply per credential or a legitimate pair fails on
// the length of the two together.
func TestALongPairOfKeysIsAccepted(t *testing.T) {
	long := strings.Repeat("a", 100)
	if err := ValidateKeys(map[string]string{KeyMDBList: long + "," + long}); err != nil {
		t.Errorf("a pair of 100-character keys was refused: %v", err)
	}
	if err := ValidateKeys(map[string]string{KeyMDBList: long + ",short"}); err == nil {
		t.Error("a list with one bad entry was accepted")
	}
}

// A list for a source that cannot rotate would be accepted and silently
// truncated, which is the inert-setting shape: it looks like it took.
func TestAListIsRefusedWhereItCannotRotate(t *testing.T) {
	long := strings.Repeat("a", 40)

	if err := ValidateKeys(map[string]string{KeyFanart: long + "," + long}); err == nil {
		t.Error("a list was accepted for a source that never rotates")
	}
	// The control: the same list is fine on a source that does rotate, so the
	// refusal is about the provider rather than about lists.
	if err := ValidateKeys(map[string]string{KeySIMKL: long + "," + long}); err != nil {
		t.Errorf("a list was refused on a rotating source: %v", err)
	}
	// And one key is still accepted everywhere.
	if err := ValidateKeys(map[string]string{KeyFanart: long}); err != nil {
		t.Errorf("a single key was refused: %v", err)
	}
}

// The spent map is keyed on the credential, so it holds only keys refused in
// the last hour rather than every list anyone has presented.
func TestTheSpentMapHoldsOnlyRefusedKeys(t *testing.T) {
	ownerSpent.mu.Lock()
	ownerSpent.at = map[string]time.Time{}
	ownerSpent.mu.Unlock()

	ctx := WithKeys(context.Background(), map[string]string{KeySIMKL: "s1,s2"})
	for range 50 {
		_ = keyFrom(ctx, KeySIMKL)
	}

	ownerSpent.mu.Lock()
	size := len(ownerSpent.at)
	ownerSpent.mu.Unlock()
	if size != 0 {
		t.Errorf("reading a list %d times left %d entries behind", 50, size)
	}

	noteOwnerKeySpent(ctx, KeySIMKL, "s1")
	ownerSpent.mu.Lock()
	size = len(ownerSpent.at)
	ownerSpent.mu.Unlock()
	if size != 1 {
		t.Errorf("a spent key left %d entries, want 1", size)
	}
}

// The read path must not walk the whole map: it runs on every render for a
// multi-key profile, and a popular one would otherwise pay for every other
// owner's refusals.
func TestReadingAListIgnoresOtherOwnersMarks(t *testing.T) {
	ownerSpent.mu.Lock()
	ownerSpent.at = map[string]time.Time{}
	for i := range 200 {
		ownerSpent.at[strings.Repeat("z", i%40+1)] = time.Now().Add(-2 * keySpentFor)
	}
	before := len(ownerSpent.at)
	ownerSpent.mu.Unlock()

	ctx := WithKeys(context.Background(), map[string]string{KeySIMKL: "mine1,mine2"})
	if got := keyFrom(ctx, KeySIMKL); got != "mine1" {
		t.Fatalf("keyFrom = %q, want mine1", got)
	}

	ownerSpent.mu.Lock()
	after := len(ownerSpent.at)
	ownerSpent.mu.Unlock()
	if after != before {
		t.Errorf("a read swept %d unrelated marks; the sweep belongs on the write path", before-after)
	}
}
