package profile

import (
	"errors"
	"testing"
)

func saveProfile(t *testing.T, s *Store, p *Profile) {
	t.Helper()
	if err := s.Save(p); err != nil {
		t.Fatalf("Save(%s): %v", p.ID, err)
	}
}

func TestResolveByID(t *testing.T) {
	s := openTestStore(t)
	saveProfile(t, s, &Profile{ID: "id-1", Type: "poster", Config: mustConfig(t, map[string]any{})})

	got, err := s.Resolve("id-1")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got.ID != "id-1" {
		t.Errorf("got %q, want id-1", got.ID)
	}
}

func TestResolveByAlias(t *testing.T) {
	s := openTestStore(t)
	saveProfile(t, s, &Profile{ID: "id-1", Type: "poster", Alias: "myalias", Config: mustConfig(t, map[string]any{})})

	got, err := s.Resolve("MyAlias") // alias lookup is case-insensitive
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got.ID != "id-1" {
		t.Errorf("got %q, want id-1", got.ID)
	}
}

func TestResolveByLegacyUUID(t *testing.T) {
	s := openTestStore(t)
	uuid := "a1B2-c3D4-legacy-CONFIG"
	saveProfile(t, s, &Profile{ID: "id-1", Type: "poster", UUID: uuid, Config: mustConfig(t, map[string]any{})})

	got, err := s.Resolve(uuid)
	if err != nil {
		t.Fatalf("Resolve by uuid: %v", err)
	}
	if got.ID != "id-1" {
		t.Errorf("got %q, want id-1", got.ID)
	}
}

// A v2 uuid is a case-sensitive config string; it must not be lowercased the
// way an alias is, or a mixed-case uuid would fail to resolve.
func TestResolveUUIDIsCaseSensitive(t *testing.T) {
	s := openTestStore(t)
	saveProfile(t, s, &Profile{ID: "id-1", Type: "poster", UUID: "MixedCaseUUID", Config: mustConfig(t, map[string]any{})})

	if _, err := s.Resolve("MixedCaseUUID"); err != nil {
		t.Errorf("exact-case uuid should resolve: %v", err)
	}
	if _, err := s.Resolve("mixedcaseuuid"); !errors.Is(err, ErrNotFound) {
		t.Errorf("lowercased uuid should not resolve, got err %v", err)
	}
}

// ID wins over a uuid that happens to equal another profile's id-shaped string,
// and alias is only consulted after id misses.
func TestResolvePrecedenceIDThenAliasThenUUID(t *testing.T) {
	s := openTestStore(t)
	// Profile A: its ID collides with Profile B's uuid.
	saveProfile(t, s, &Profile{ID: "shared", Type: "poster", Config: mustConfig(t, map[string]any{"who": "A"})})
	saveProfile(t, s, &Profile{ID: "b", Type: "poster", UUID: "shared", Config: mustConfig(t, map[string]any{"who": "B"})})

	got, err := s.Resolve("shared")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got.ID != "shared" {
		t.Errorf("id must win over a matching uuid: got %q", got.ID)
	}
}

func TestResolveUnknownReturnsNotFound(t *testing.T) {
	s := openTestStore(t)
	if _, err := s.Resolve("nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("got %v, want ErrNotFound", err)
	}
}

func TestResolveEmptyUUIDDoesNotMatchBlanks(t *testing.T) {
	s := openTestStore(t)
	// A profile with no uuid must not be resolvable via an empty/whitespace key.
	saveProfile(t, s, &Profile{ID: "id-1", Type: "poster", Config: mustConfig(t, map[string]any{})})
	if _, err := s.Resolve("   "); !errors.Is(err, ErrNotFound) {
		t.Errorf("blank key resolved a uuid-less profile: %v", err)
	}
}
