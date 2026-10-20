package provider

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// A call made with the owner's own key draws on their allowance, not the instance's.
func TestOwnerKeyedCallsDoNotSpendTheSharedDailyBudget(t *testing.T) {
	b := mdbBudget(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("{}"))
	}))
	t.Cleanup(srv.Close)
	client := newHTTPClient("mdblist", 5*time.Second)

	spentAfter := func(keys map[string]string) int {
		b.mu.Lock()
		before := b.spent
		b.mu.Unlock()
		req, err := http.NewRequestWithContext(WithKeys(t.Context(), keys), http.MethodGet, srv.URL+"?apikey=k", nil)
		if err != nil {
			t.Fatal(err)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		_ = resp.Body.Close()
		b.mu.Lock()
		defer b.mu.Unlock()
		return b.spent - before
	}

	if got := spentAfter(map[string]string{"mdblist": "owner-key"}); got != 0 {
		t.Errorf("an owner-keyed call spent %d of the shared budget", got)
	}
	if got := spentAfter(nil); got != 1 {
		t.Errorf("an instance-keyed call spent %d, want 1", got)
	}
}
