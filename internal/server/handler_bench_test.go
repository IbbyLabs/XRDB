package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"xrdb_rewrite/internal/config"
)

type renderRequestFixture struct {
	Type   string `json:"type"`
	ID     string `json:"id"`
	Config string `json:"config"`
	UUID   string `json:"uuid"`
}

type noopResponseWriter struct {
	header http.Header
	code   int
	n      int
}

func newNoopResponseWriter() *noopResponseWriter {
	return &noopResponseWriter{header: make(http.Header)}
}

func (w *noopResponseWriter) Header() http.Header { return w.header }

func (w *noopResponseWriter) WriteHeader(statusCode int) { w.code = statusCode }

func (w *noopResponseWriter) Write(p []byte) (int, error) {
	w.n += len(p)
	return len(p), nil
}

func (w *noopResponseWriter) reset() {
	w.code = 0
	w.n = 0
}

func BenchmarkHealthzHandler(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			b.Fatalf("expected 200, got %d", rr.Code)
		}
	}
}

func BenchmarkRenderPlaceholderHandler(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/render-placeholder?type=poster&id=tt0816692&config=compact&uuid=abc123", nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			b.Fatalf("expected 200, got %d", rr.Code)
		}
	}
}

func BenchmarkRenderPlaceholderHandlerFromFixtures(b *testing.B) {
	fixtures := loadRenderRequestFixtures(b)
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	requests := make([]*http.Request, 0, len(fixtures))
	for _, f := range fixtures {
		path := "/render-placeholder?type=" + f.Type + "&id=" + f.ID + "&config=" + f.Config + "&uuid=" + f.UUID
		requests = append(requests, httptest.NewRequest(http.MethodGet, path, nil))
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		req := requests[i%len(requests)]
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			b.Fatalf("expected 200, got %d", rr.Code)
		}
	}
}

func BenchmarkRenderPlaceholderHandlerNoopWriter(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/render-placeholder?type=poster&id=tt0816692&config=compact&uuid=abc123", nil)
	w := newNoopResponseWriter()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w.reset()
		h.ServeHTTP(w, req)
		if w.code != http.StatusOK {
			b.Fatalf("expected 200, got %d", w.code)
		}
	}
}

func BenchmarkRenderPlaceholderHandlerWithSimulation(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/render-placeholder?type=poster&id=tt0816692&config=compact&uuid=abc123&simulate=1", nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			b.Fatalf("expected 200, got %d", rr.Code)
		}
	}
}

func BenchmarkRenderPlaceholderHandlerWithSimulationLight(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/render-placeholder?type=poster&id=tt0816692&config=compact&uuid=abc123&simulate=light", nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			b.Fatalf("expected 200, got %d", rr.Code)
		}
	}
}

func BenchmarkRenderPlaceholderHandlerWithSimulationMedium(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/render-placeholder?type=poster&id=tt0816692&config=compact&uuid=abc123&simulate=medium", nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			b.Fatalf("expected 200, got %d", rr.Code)
		}
	}
}

func BenchmarkRenderPlaceholderHandlerWithSimulationHeavy(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/render-placeholder?type=poster&id=tt0816692&config=compact&uuid=abc123&simulate=heavy", nil)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			b.Fatalf("expected 200, got %d", rr.Code)
		}
	}
}

func BenchmarkRenderImagePoster(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/poster/tt0816692?config=compact&uuid=abc123", nil)
	w := newNoopResponseWriter()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w.reset()
		h.ServeHTTP(w, req)
		if w.code != http.StatusOK {
			b.Fatalf("expected 200, got %d", w.code)
		}
	}
}

func BenchmarkRenderImageBackdrop(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/backdrop/tt0816692?config=compact&uuid=abc123", nil)
	w := newNoopResponseWriter()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w.reset()
		h.ServeHTTP(w, req)
		if w.code != http.StatusOK {
			b.Fatalf("expected 200, got %d", w.code)
		}
	}
}

func BenchmarkRenderImageThumbnail(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/thumbnail/tt0816692?config=compact&uuid=abc123", nil)
	w := newNoopResponseWriter()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w.reset()
		h.ServeHTTP(w, req)
		if w.code != http.StatusOK {
			b.Fatalf("expected 200, got %d", w.code)
		}
	}
}

func BenchmarkRenderImageLogo(b *testing.B) {
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	req := httptest.NewRequest(http.MethodGet, "/logo/tt0816692?config=compact&uuid=abc123", nil)
	w := newNoopResponseWriter()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w.reset()
		h.ServeHTTP(w, req)
		if w.code != http.StatusOK {
			b.Fatalf("expected 200, got %d", w.code)
		}
	}
}

func BenchmarkRenderImageFromFixtures(b *testing.B) {
	fixtures := loadRenderRequestFixtures(b)
	h := NewHandler("bench", nil, nil, nil, nil, config.Config{})
	requests := make([]*http.Request, 0, len(fixtures))
	for _, f := range fixtures {
		path := "/" + f.Type + "/" + f.ID + "?config=" + f.Config + "&uuid=" + f.UUID
		requests = append(requests, httptest.NewRequest(http.MethodGet, path, nil))
	}
	w := newNoopResponseWriter()
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		w.reset()
		req := requests[i%len(requests)]
		h.ServeHTTP(w, req)
		if w.code != http.StatusOK {
			b.Fatalf("expected 200, got %d", w.code)
		}
	}
}

func loadRenderRequestFixtures(b *testing.B) []renderRequestFixture {
	b.Helper()
	raw, err := os.ReadFile("../../fixtures/bench/render-placeholder-requests.json")
	if err != nil {
		b.Fatalf("failed to read fixture file: %v", err)
	}
	var fixtures []renderRequestFixture
	if err := json.Unmarshal(raw, &fixtures); err != nil {
		b.Fatalf("failed to parse fixture file: %v", err)
	}
	if len(fixtures) == 0 {
		b.Fatalf("expected at least one fixture")
	}
	return fixtures
}
