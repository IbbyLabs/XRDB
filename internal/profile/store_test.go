package profile

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"
)

func openTestStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s
}

func mustConfig(t *testing.T, v any) json.RawMessage {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}
	return b
}

func TestSaveAndGet(t *testing.T) {
	s := openTestStore(t)
	p := &Profile{
		ID:     "abc123",
		Type:   "poster",
		Name:   "My Profile",
		UUID:   "tenant-1",
		Config: mustConfig(t, map[string]any{"ratings": "imdb"}),
	}
	if err := s.Save(p); err != nil {
		t.Fatalf("Save: %v", err)
	}
	if p.Version != 1 {
		t.Errorf("expected Version=1, got %d", p.Version)
	}
	if p.CreatedAt == "" {
		t.Error("expected CreatedAt to be set")
	}

	got, err := s.Get("abc123")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != "abc123" || got.Type != "poster" || got.Name != "My Profile" {
		t.Errorf("unexpected profile: %+v", got)
	}
	if got.Version != 1 {
		t.Errorf("expected Version=1, got %d", got.Version)
	}
}

func TestGetNotFound(t *testing.T) {
	s := openTestStore(t)
	_, err := s.Get("nonexistent")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestSaveConflict(t *testing.T) {
	s := openTestStore(t)
	p := &Profile{ID: "dup", Type: "poster", Config: mustConfig(t, map[string]any{})}
	if err := s.Save(p); err != nil {
		t.Fatalf("first Save: %v", err)
	}
	p2 := &Profile{ID: "dup", Type: "backdrop", Config: mustConfig(t, map[string]any{})}
	if err := s.Save(p2); !errors.Is(err, ErrConflict) {
		t.Fatalf("expected ErrConflict, got %v", err)
	}
}

func TestUpdate(t *testing.T) {
	s := openTestStore(t)
	p := &Profile{
		ID:     "upd1",
		Type:   "poster",
		Config: mustConfig(t, map[string]any{"v": 1}),
	}
	if err := s.Save(p); err != nil {
		t.Fatalf("Save: %v", err)
	}
	savedAt := p.UpdatedAt

	p.Name = "Updated Name"
	p.Config = mustConfig(t, map[string]any{"v": 2})
	if err := s.Update(p); err != nil {
		t.Fatalf("Update: %v", err)
	}

	got, err := s.Get("upd1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Name != "Updated Name" {
		t.Errorf("expected updated name, got %q", got.Name)
	}
	var cfg map[string]any
	if err := json.Unmarshal(got.Config, &cfg); err != nil {
		t.Fatalf("unmarshal config: %v", err)
	}
	if cfg["v"] != float64(2) {
		t.Errorf("expected v=2 in config, got %v", cfg["v"])
	}
	if got.UpdatedAt == savedAt {
		t.Error("expected UpdatedAt to change after Update")
	}
}

func TestUpdateNotFound(t *testing.T) {
	s := openTestStore(t)
	p := &Profile{ID: "missing", Type: "poster", Config: mustConfig(t, map[string]any{})}
	if err := s.Update(p); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestSaveRequiresID(t *testing.T) {
	s := openTestStore(t)
	p := &Profile{Type: "poster", Config: mustConfig(t, map[string]any{})}
	if err := s.Save(p); err == nil {
		t.Fatal("expected error for empty ID")
	}
}

func TestSaveRequiresType(t *testing.T) {
	s := openTestStore(t)
	p := &Profile{ID: "abc", Config: mustConfig(t, map[string]any{})}
	if err := s.Save(p); err == nil {
		t.Fatal("expected error for empty Type")
	}
}

func TestSaveNilConfigBecomesEmptyObject(t *testing.T) {
	s := openTestStore(t)
	p := &Profile{ID: "nilcfg", Type: "logo"}
	if err := s.Save(p); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := s.Get("nilcfg")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(got.Config) != "{}" {
		t.Errorf("expected config={}, got %s", got.Config)
	}
}

func TestVersionIsAlwaysSchemaVersion(t *testing.T) {
	s := openTestStore(t)
	p := &Profile{ID: "vcheck", Type: "poster", Version: 99}
	if err := s.Save(p); err != nil {
		t.Fatalf("Save: %v", err)
	}
	got, err := s.Get("vcheck")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.Version != schemaVersion {
		t.Errorf("expected version=%d, got %d", schemaVersion, got.Version)
	}
}

func TestListEmpty(t *testing.T) {
	s := openTestStore(t)
	profiles, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(profiles) != 0 {
		t.Errorf("expected empty list, got %d profiles", len(profiles))
	}
}

func TestList(t *testing.T) {
	s := openTestStore(t)
	ids := []string{"x1", "x2", "x3"}
	for _, id := range ids {
		p := &Profile{ID: id, Type: "poster", Config: mustConfig(t, map[string]any{})}
		if err := s.Save(p); err != nil {
			t.Fatalf("Save %s: %v", id, err)
		}
	}
	profiles, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(profiles) != len(ids) {
		t.Fatalf("expected %d profiles, got %d", len(ids), len(profiles))
	}
	seen := make(map[string]bool)
	for _, p := range profiles {
		seen[p.ID] = true
	}
	for _, id := range ids {
		if !seen[id] {
			t.Errorf("expected profile %q in list", id)
		}
	}
}

func TestListOrderedByCreatedAt(t *testing.T) {
	s := openTestStore(t)
	for _, id := range []string{"first", "second", "third"} {
		p := &Profile{ID: id, Type: "poster", Config: mustConfig(t, map[string]any{})}
		if err := s.Save(p); err != nil {
			t.Fatalf("Save %s: %v", id, err)
		}
	}
	profiles, err := s.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(profiles) != 3 {
		t.Fatalf("expected 3 profiles, got %d", len(profiles))
	}
	if profiles[0].ID != "first" {
		t.Errorf("expected first profile id='first', got %q", profiles[0].ID)
	}
}
