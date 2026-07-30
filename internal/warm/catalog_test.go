package warm

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func addon(t *testing.T, handler http.HandlerFunc) *httptest.Server {
	t.Helper()
	s := httptest.NewServer(handler)
	t.Cleanup(s.Close)
	return s
}

func TestIDsReadsEveryCatalogue(t *testing.T) {
	s := addon(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest.json":
			_, _ = w.Write([]byte(`{"catalogs":[{"type":"movie","id":"top"},{"type":"series","id":"new"}]}`))
		case "/catalog/movie/top.json":
			_, _ = w.Write([]byte(`{"metas":[{"id":"tt1"},{"id":"tt2"}]}`))
		case "/catalog/series/new.json":
			_, _ = w.Write([]byte(`{"metas":[{"id":"tt3"}]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})

	ids, err := (&Client{}).IDs(context.Background(), s.URL+"/manifest.json", 100)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"tt1", "tt2", "tt3"}
	if len(ids) != len(want) {
		t.Fatalf("got %v, want %v", ids, want)
	}
	for i := range want {
		if ids[i] != want[i] {
			t.Errorf("position %d: got %q, want %q", i, ids[i], want[i])
		}
	}
}

// A title listed by two catalogues is one render, not two.
func TestIDsDeduplicatesAndRespectsTheLimit(t *testing.T) {
	s := addon(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest.json":
			_, _ = w.Write([]byte(`{"catalogs":[{"type":"movie","id":"a"},{"type":"movie","id":"b"}]}`))
		case "/catalog/movie/a.json":
			_, _ = w.Write([]byte(`{"metas":[{"id":"tt1"},{"id":"tt2"},{"id":"tt1"}]}`))
		case "/catalog/movie/b.json":
			_, _ = w.Write([]byte(`{"metas":[{"id":"tt2"},{"id":"tt3"}]}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	})
	c := &Client{}

	all, err := c.IDs(context.Background(), s.URL+"/manifest.json", 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 3 {
		t.Errorf("got %v, want three unique ids", all)
	}

	capped, err := c.IDs(context.Background(), s.URL+"/manifest.json", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(capped) != 2 {
		t.Errorf("limit ignored: got %v", capped)
	}
}

// One broken catalogue must not cost the run every other title.
func TestABrokenCatalogueIsSkipped(t *testing.T) {
	s := addon(t, func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/manifest.json":
			_, _ = w.Write([]byte(`{"catalogs":[{"type":"movie","id":"broken"},{"type":"movie","id":"ok"}]}`))
		case "/catalog/movie/ok.json":
			_, _ = w.Write([]byte(`{"metas":[{"id":"tt9"}]}`))
		default:
			w.WriteHeader(http.StatusInternalServerError)
		}
	})

	ids, err := (&Client{}).IDs(context.Background(), s.URL+"/manifest.json", 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(ids) != 1 || ids[0] != "tt9" {
		t.Errorf("got %v, want just tt9", ids)
	}
}

func TestAnUnreachableManifestIsAnError(t *testing.T) {
	s := addon(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	if _, err := (&Client{}).IDs(context.Background(), s.URL+"/manifest.json", 10); err == nil {
		t.Error("a missing manifest was not reported")
	}
	if _, err := (&Client{}).IDs(context.Background(), "", 10); err == nil {
		t.Error("an empty manifest URL was not reported")
	}
}

func TestBaseOfAcceptsEitherForm(t *testing.T) {
	for _, in := range []string{"https://x.dev/manifest.json", "https://x.dev", " https://x.dev/manifest.json "} {
		if got := baseOf(in); got != "https://x.dev" {
			t.Errorf("baseOf(%q) = %q", in, got)
		}
	}
}

// A zero limit means no warming was asked for, not unlimited warming.
func TestAZeroLimitFetchesNothing(t *testing.T) {
	s := addon(t, func(w http.ResponseWriter, _ *http.Request) {
		t.Error("the addon was called for a zero limit")
		w.WriteHeader(http.StatusOK)
	})
	ids, err := (&Client{}).IDs(context.Background(), s.URL+"/manifest.json", 0)
	if err != nil || len(ids) != 0 {
		t.Errorf("got %v, %v", ids, err)
	}
}
