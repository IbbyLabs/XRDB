package settings

import (
	"errors"
	"path/filepath"
	"testing"
)

func openTmp(t *testing.T) *Store {
	t.Helper()
	dir := t.TempDir()
	s, err := Open(filepath.Join(dir, "settings.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestSetGet(t *testing.T) {
	s := openTmp(t)
	if err := s.Set("tmdb_api_key", "abc123"); err != nil {
		t.Fatalf("Set: %v", err)
	}
	v, err := s.Get("tmdb_api_key")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if v != "abc123" {
		t.Errorf("got %q, want abc123", v)
	}
}

func TestGetNotFound(t *testing.T) {
	s := openTmp(t)
	_, err := s.Get("nonexistent")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestUpsert(t *testing.T) {
	s := openTmp(t)
	_ = s.Set("k", "v1")
	_ = s.Set("k", "v2")
	v, _ := s.Get("k")
	if v != "v2" {
		t.Errorf("expected upsert to update value, got %q", v)
	}
}

func TestDelete(t *testing.T) {
	s := openTmp(t)
	_ = s.Set("k", "v")
	_ = s.Delete("k")
	_, err := s.Get("k")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestDeleteNoop(t *testing.T) {
	s := openTmp(t)
	if err := s.Delete("nope"); err != nil {
		t.Errorf("Delete nonexistent key should not error: %v", err)
	}
}

func TestAll(t *testing.T) {
	s := openTmp(t)
	_ = s.Set("a", "1")
	_ = s.Set("b", "2")
	m, err := s.All()
	if err != nil {
		t.Fatalf("All: %v", err)
	}
	if m["a"] != "1" || m["b"] != "2" {
		t.Errorf("All returned unexpected map: %v", m)
	}
}

func TestPersistence(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "settings.db")
	s1, _ := Open(path)
	_ = s1.Set("key", "persisted")
	_ = s1.Close()

	s2, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer s2.Close()
	v, err := s2.Get("key")
	if err != nil || v != "persisted" {
		t.Errorf("persistence failed: got %q, %v", v, err)
	}
}
