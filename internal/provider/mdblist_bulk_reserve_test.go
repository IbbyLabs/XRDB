package provider

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"
)

func mdbBudget(t *testing.T) *dailyBudget {
	t.Helper()
	b := dailyBudgetFor("mdblist")
	if b == nil {
		t.Fatal("mdblist has no daily budget, so a sweep cannot be held off it")
	}
	return b
}

// A catalogue sweep spends the same allowance a person's render needs, and
// MDBList answers nobody once it is gone.
func TestABulkCallerIsHeldOffMDBListsReserve(t *testing.T) {
	b := mdbBudget(t)
	b.mu.Lock()
	b.limit, b.reserve, b.spent, b.day = 1000, 250, 0, time.Time{}
	b.mu.Unlock()

	if !b.allowsBulk() {
		t.Fatal("a fresh allowance already refuses bulk callers")
	}
	b.mu.Lock()
	b.spent = 751
	b.mu.Unlock()
	if b.allowsBulk() {
		t.Error("a bulk caller reached the reserve")
	}
}

// The allowance goes by plan, so a compiled-in limit is right for one plan and
// wrong for every other. The reserve has to follow the reported number.
func TestTheReserveFollowsTheReportedLimit(t *testing.T) {
	b := mdbBudget(t)
	b.mu.Lock()
	b.limit, b.reserve, b.reservePct = 100000, 25000, 25
	b.mu.Unlock()

	b.setLimit("", 1000)

	b.mu.Lock()
	limit, reserve := b.limit, b.reserve
	b.mu.Unlock()
	if limit != 1000 {
		t.Errorf("limit = %d, want 1000", limit)
	}
	if reserve != 250 {
		t.Errorf("reserve = %d, want 250 (25%% of the reported limit)", reserve)
	}
}

// The header is where the real number lives, so it has to reach the budget.
//
// It travels through the transport rather than the governor: the budget counts
// every key together and so needs to know which credential answered, and the
// governor is handed only the headers. Driven through a real request because the
// key is read off the query string, which no test of the governor would exercise.
func TestARequestsHeaderRecordsTheLimitAgainstItsKey(t *testing.T) {
	b := mdbBudget(t)
	b.mu.Lock()
	b.limit, b.reservePct, b.ringSize, b.observedLimits = 100000, 25, 1, nil
	b.mu.Unlock()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateLimit-Limit", "5000")
		w.Header().Set("X-RateLimit-Remaining", "4000")
		w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(time.Now().Add(time.Hour).Unix(), 10))
		_, _ = w.Write([]byte("{}"))
	}))
	t.Cleanup(srv.Close)

	client := newHTTPClient("mdblist", 5*time.Second)
	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, srv.URL+"?apikey=key-a", nil)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	_ = resp.Body.Close()

	b.mu.Lock()
	limit, observed := b.limit, len(b.observedLimits)
	b.mu.Unlock()
	if limit != 5000 {
		t.Errorf("limit = %d, want the reported 5000", limit)
	}
	if observed != 1 {
		t.Errorf("observed %d keys, want the one the request used", observed)
	}
}
