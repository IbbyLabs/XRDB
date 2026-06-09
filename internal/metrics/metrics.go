// Package metrics provides an in-process request metrics store.
package metrics

import (
	"sync"
	"sync/atomic"
	"time"
)

// Record is a single request event.
type Record struct {
	Route      string
	StatusCode int
	LatencyMs  float64
	Timestamp  time.Time
}

// Snapshot is a point-in-time view of collected metrics.
type Snapshot struct {
	TotalRequests int64              `json:"totalRequests"`
	ByStatus      map[int]int64      `json:"byStatus"`
	ByRoute       map[string]int64   `json:"byRoute"`
	P50Ms         float64            `json:"p50Ms"`
	P95Ms         float64            `json:"p95Ms"`
	P99Ms         float64            `json:"p99Ms"`
	UptimeSeconds float64            `json:"uptimeSeconds"`
}

// Store collects request metrics with a bounded ring buffer.
type Store struct {
	mu         sync.Mutex
	ring       []Record
	head       int
	total      atomic.Int64
	startedAt  time.Time
}

const ringSize = 2000

// New creates an empty Store.
func New() *Store {
	return &Store{
		ring:      make([]Record, ringSize),
		startedAt: time.Now(),
	}
}

// Record adds an observation to the store.
func (s *Store) Record(route string, status int, latencyMs float64) {
	s.total.Add(1)
	s.mu.Lock()
	s.ring[s.head%ringSize] = Record{
		Route:      route,
		StatusCode: status,
		LatencyMs:  latencyMs,
		Timestamp:  time.Now(),
	}
	s.head++
	s.mu.Unlock()
}

// Snapshot returns a point-in-time summary of collected metrics.
func (s *Store) Snapshot() Snapshot {
	s.mu.Lock()
	n := s.head
	if n > ringSize {
		n = ringSize
	}
	records := make([]Record, n)
	for i := 0; i < n; i++ {
		idx := (s.head - n + i) % ringSize
		if idx < 0 {
			idx += ringSize
		}
		records[i] = s.ring[idx]
	}
	s.mu.Unlock()

	byStatus := make(map[int]int64)
	byRoute := make(map[string]int64)
	latencies := make([]float64, 0, n)
	for _, r := range records {
		byStatus[r.StatusCode]++
		byRoute[r.Route]++
		latencies = append(latencies, r.LatencyMs)
	}

	sortFloat64s(latencies)
	return Snapshot{
		TotalRequests: s.total.Load(),
		ByStatus:      byStatus,
		ByRoute:       byRoute,
		P50Ms:         percentile(latencies, 50),
		P95Ms:         percentile(latencies, 95),
		P99Ms:         percentile(latencies, 99),
		UptimeSeconds: time.Since(s.startedAt).Seconds(),
	}
}

func percentile(sorted []float64, p int) float64 {
	if len(sorted) == 0 {
		return 0
	}
	idx := int(float64(len(sorted)-1) * float64(p) / 100.0)
	return sorted[idx]
}

func sortFloat64s(s []float64) {
	// insertion sort — ring is small (≤2000) so this is fine
	for i := 1; i < len(s); i++ {
		v := s[i]
		j := i - 1
		for j >= 0 && s[j] > v {
			s[j+1] = s[j]
			j--
		}
		s[j+1] = v
	}
}
