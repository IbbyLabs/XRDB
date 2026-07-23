package render

import "testing"

func TestSimulateCompositionCostDeterministic(t *testing.T) {
	a := SimulateCompositionCost("poster", "tt0816692", "compact", "abc123")
	b := SimulateCompositionCost("poster", "tt0816692", "compact", "abc123")
	if a != b {
		t.Fatalf("expected deterministic simulation cost")
	}
}

func TestSimulateCompositionCostTierDeterministic(t *testing.T) {
	a := SimulateCompositionCostTier("poster", "tt0816692", "compact", "abc123", "heavy")
	b := SimulateCompositionCostTier("poster", "tt0816692", "compact", "abc123", "heavy")
	if a != b {
		t.Fatalf("expected deterministic simulation cost for tier")
	}
}

func TestSimulationIterationsFallback(t *testing.T) {
	if got := simulationIterations("unknown"); got != 32 {
		t.Fatalf("expected unknown tier to fallback to 32 iterations")
	}
}

func BenchmarkSimulateCompositionCost(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = SimulateCompositionCost(
			"poster",
			"tt0816692",
			"mode=compact;year=1;genre=1;rating=imdb",
			"uuid=abc123",
		)
	}
}

func BenchmarkSimulateCompositionCostLight(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = SimulateCompositionCostTier(
			"poster",
			"tt0816692",
			"mode=compact;year=1;genre=1;rating=imdb",
			"uuid=abc123",
			"light",
		)
	}
}

func BenchmarkSimulateCompositionCostMedium(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = SimulateCompositionCostTier(
			"poster",
			"tt0816692",
			"mode=compact;year=1;genre=1;rating=imdb",
			"uuid=abc123",
			"medium",
		)
	}
}

func BenchmarkSimulateCompositionCostHeavy(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_ = SimulateCompositionCostTier(
			"poster",
			"tt0816692",
			"mode=compact;year=1;genre=1;rating=imdb",
			"uuid=abc123",
			"heavy",
		)
	}
}
