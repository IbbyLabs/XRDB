package profile

import (
	"encoding/json"
	"path/filepath"
	"testing"
)

func previewStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "preview.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

// FR-208. The configurator's preview title is a property of working on a
// profile, so it is stored beside the config rather than in it.
func TestAPreviewSurvivesASaveAndLoad(t *testing.T) {
	s := previewStore(t)
	want := &Preview{MediaType: "poster", ID: "tt2560140", Title: "Attack on Titan (2013)"}
	if err := s.Save(&Profile{ID: "p1", Type: "poster", Config: json.RawMessage(`{}`), Preview: want}); err != nil {
		t.Fatalf("save: %v", err)
	}

	got, err := s.Get("p1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Preview == nil {
		t.Fatal("the preview did not come back")
	}
	if *got.Preview != *want {
		t.Errorf("preview %+v, want %+v", *got.Preview, *want)
	}
}

// A profile saved without one reads back as nil rather than an empty object, so
// the configurator can tell "never chosen" from a stored blank.
func TestAProfileWithNoPreviewReadsBackNil(t *testing.T) {
	s := previewStore(t)
	if err := s.Save(&Profile{ID: "p2", Type: "poster", Config: json.RawMessage(`{}`)}); err != nil {
		t.Fatalf("save: %v", err)
	}

	got, err := s.Get("p2")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Preview != nil {
		t.Errorf("preview %+v, want nil", *got.Preview)
	}
}

// An update carrying a preview replaces the stored one.
func TestAnUpdateReplacesThePreview(t *testing.T) {
	s := previewStore(t)
	first := &Preview{MediaType: "poster", ID: "tt1", Title: "First"}
	if err := s.Save(&Profile{ID: "p3", Type: "poster", Config: json.RawMessage(`{}`), Preview: first}); err != nil {
		t.Fatalf("save: %v", err)
	}
	second := &Preview{MediaType: "backdrop", ID: "tt2", Title: "Second"}
	if err := s.Update(&Profile{ID: "p3", Type: "poster", Config: json.RawMessage(`{}`), Preview: second}); err != nil {
		t.Fatalf("update: %v", err)
	}

	got, err := s.Get("p3")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Preview == nil || *got.Preview != *second {
		t.Errorf("preview %v, want %+v", got.Preview, *second)
	}
}

// An update carrying an empty preview clears it, so a profile can go back to
// the built-in default rather than being stuck on a title forever.
func TestAnEmptyPreviewClearsTheStoredOne(t *testing.T) {
	s := previewStore(t)
	if err := s.Save(&Profile{ID: "p4", Type: "poster", Config: json.RawMessage(`{}`),
		Preview: &Preview{MediaType: "poster", ID: "tt1", Title: "First"}}); err != nil {
		t.Fatalf("save: %v", err)
	}
	if err := s.Update(&Profile{ID: "p4", Type: "poster", Config: json.RawMessage(`{}`), Preview: &Preview{}}); err != nil {
		t.Fatalf("update: %v", err)
	}

	got, err := s.Get("p4")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Preview != nil {
		t.Errorf("preview %+v, want nil after clearing", *got.Preview)
	}
}

// List reads the same column as Get. It has its own scan, which is where this
// went wrong first time.
func TestListCarriesThePreview(t *testing.T) {
	s := previewStore(t)
	want := &Preview{MediaType: "poster", ID: "tt5", Title: "Listed"}
	if err := s.Save(&Profile{ID: "p5", Type: "poster", Config: json.RawMessage(`{}`), Preview: want}); err != nil {
		t.Fatalf("save: %v", err)
	}

	all, err := s.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	for _, p := range all {
		if p.ID != "p5" {
			continue
		}
		if p.Preview == nil || *p.Preview != *want {
			t.Errorf("listed preview %v, want %+v", p.Preview, *want)
		}
		return
	}
	t.Fatal("the saved profile was not listed")
}

// Unreadable stored content loads as no preview rather than failing the profile.
func TestUnreadablePreviewContentLoadsAsNone(t *testing.T) {
	if got := decodePreview("not json"); got != nil {
		t.Errorf("decodePreview(%q) = %+v, want nil", "not json", *got)
	}
	if got := decodePreview(`{"title":""}`); got != nil {
		t.Errorf("an all-empty preview decoded to %+v, want nil", *got)
	}
}
