package provider

import (
	"context"
	"errors"
	"net/http"
	"testing"
)

// mdblist meters a daily allowance rather than a per-second rate, so a spent
// allowance stands until the window rolls over. QuotaExhausted is what routes
// that into the longer cooldown, and only the allowance header can tell the two
// kinds of refusal apart.
func TestMDBListRefusalClassification(t *testing.T) {
	cases := []struct {
		name      string
		remaining string
		wantQuota bool
	}{
		{"allowance spent", "0", true},
		{"allowance left", "4231", false},
		{"header absent, cannot be classified", "", false},
		{"header unparseable", "not-a-number", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := http.Header{}
			if tc.remaining != "" {
				h.Set("X-RateLimit-Remaining", tc.remaining)
			}
			resp := &http.Response{StatusCode: http.StatusTooManyRequests, Header: h}

			m := &MDBList{}
			err := m.refusal(context.Background(), resp)

			var rl *RateLimitError
			if !errors.As(err, &rl) {
				t.Fatalf("got %T, want *RateLimitError", err)
			}
			if rl.QuotaExhausted != tc.wantQuota {
				t.Errorf("QuotaExhausted = %v, want %v", rl.QuotaExhausted, tc.wantQuota)
			}
			if rl.Source != "mdblist" || rl.Status != http.StatusTooManyRequests {
				t.Errorf("source/status lost: %q %d", rl.Source, rl.Status)
			}
		})
	}
}

// An absent header must not be read as a spent allowance. Guessing there would
// take the source out for the rest of the day on no evidence, which is worse
// than the refusal it is trying to classify.
func TestMDBListAbsentHeaderIsNotTreatedAsExhausted(t *testing.T) {
	m := &MDBList{}
	err := m.refusal(context.Background(), &http.Response{
		StatusCode: http.StatusTooManyRequests,
		Header:     http.Header{},
	})

	var rl *RateLimitError
	if !errors.As(err, &rl) {
		t.Fatalf("got %T, want *RateLimitError", err)
	}
	if rl.QuotaExhausted {
		t.Fatal("an unclassifiable refusal was reported as a spent allowance")
	}
}
