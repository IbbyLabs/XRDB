package provider

import (
	"context"
	"net/http"
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

			m.refusal(context.Background(), &http.Response{
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

	m.refusal(ctx, &http.Response{StatusCode: http.StatusTooManyRequests, Header: h}, "theirs")

	if got := m.keys.current(); got != "first" {
		t.Errorf("current = %q, want first", got)
	}
}
