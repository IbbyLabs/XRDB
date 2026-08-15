package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"xrdb_rewrite/internal/config"
)

// healthzFeatures reads the feature map /healthz reports for a config.
func healthzFeatures(t *testing.T, cfg config.Config) map[string]bool {
	t.Helper()
	h := NewHandler("test", nil, nil, nil, nil, cfg)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	var got struct {
		Features map[string]bool `json:"features"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode healthz: %v", err)
	}
	return got.Features
}

func TestHealthzReportsTopRatedOnlyWithItsDataset(t *testing.T) {
	cases := []struct {
		name     string
		dir      string
		asked    bool
		topRated bool
		dataset  bool
	}{
		{"asked without the dataset", "", true, false, false},
		{"asked with the dataset", "/data/imdb", true, true, true},
		{"dataset without the ranking", "/data/imdb", false, false, true},
		{"neither", "", false, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := healthzFeatures(t, config.Config{IMDbDatasetDir: tc.dir, IMDbTopRated: tc.asked})
			if f["imdbTopRated"] != tc.topRated {
				t.Fatalf("imdbTopRated: got %v, want %v", f["imdbTopRated"], tc.topRated)
			}
			if f["imdbDataset"] != tc.dataset {
				t.Fatalf("imdbDataset: got %v, want %v", f["imdbDataset"], tc.dataset)
			}
		})
	}
}

// The gate here is the same one cmd/api applies before calling EnableTopRated,
// so a report built from the raw setting alone has to fail.
func TestHealthzTopRatedIsNotTheRawSetting(t *testing.T) {
	f := healthzFeatures(t, config.Config{IMDbTopRated: true})
	if f["imdbTopRated"] {
		t.Fatal("imdbTopRated reported true with no dataset directory")
	}
}
