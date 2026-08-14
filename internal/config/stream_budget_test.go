package config

import (
	"testing"
	"time"
)

// The render's wait and the call's own timeout are different limits now. A
// budget at or above the timeout would restore the behaviour being removed.
func TestTheRenderBudgetStaysBelowTheCallTimeout(t *testing.T) {
	t.Setenv("XRDB_STREAM_TIMEOUT_MS", "2500")
	t.Setenv("XRDB_STREAM_BUDGET_MS", "4000")
	cfg := Load()
	if cfg.StreamBudget >= cfg.StreamTimeout {
		t.Fatalf("budget %v is not below the call timeout %v", cfg.StreamBudget, cfg.StreamTimeout)
	}
}

func TestTheBudgetDefaultsWellBelowTheTimeout(t *testing.T) {
	cfg := Load()
	if cfg.StreamBudget != 300*time.Millisecond {
		t.Fatalf("default budget is %v", cfg.StreamBudget)
	}
	if cfg.StreamTimeout != 30*time.Second {
		t.Fatalf("default call timeout is %v", cfg.StreamTimeout)
	}
}
