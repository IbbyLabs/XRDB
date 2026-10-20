package profile

import (
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
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

func TestGetByUUID(t *testing.T) {
	s := openTestStore(t)
	saveProfile(t, s, &Profile{ID: "id-1", Type: "poster", UUID: "u-1", Config: mustConfig(t, map[string]any{})})

	got, err := s.GetByUUID("u-1")
	if err != nil {
		t.Fatalf("GetByUUID: %v", err)
	}
	if got.ID != "id-1" {
		t.Errorf("got %q, want id-1", got.ID)
	}
	if _, err := s.GetByUUID("nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown uuid: got %v, want ErrNotFound", err)
	}
	if _, err := s.GetByUUID(""); !errors.Is(err, ErrNotFound) {
		t.Errorf("empty uuid: got %v, want ErrNotFound", err)
	}
}

// The unique uuid index keeps import idempotent under concurrency: many
// simultaneous inserts of one legacy identity must yield exactly one profile.
func TestConcurrentSaveSameUUIDKeepsOne(t *testing.T) {
	s := openTestStore(t)
	const n = 12
	var wg sync.WaitGroup
	var okCount, conflictCount int32
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			err := s.Save(&Profile{
				ID:     fmt.Sprintf("id-%d", i),
				Type:   "poster",
				UUID:   "shared-legacy-uuid",
				Config: mustConfig(t, map[string]any{}),
			})
			switch {
			case err == nil:
				atomic.AddInt32(&okCount, 1)
			case errors.Is(err, ErrConflict):
				atomic.AddInt32(&conflictCount, 1)
			default:
				t.Errorf("unexpected error: %v", err)
			}
		}(i)
	}
	wg.Wait()

	if okCount != 1 {
		t.Errorf("expected exactly 1 successful insert, got %d", okCount)
	}
	if conflictCount != n-1 {
		t.Errorf("expected %d conflicts, got %d", n-1, conflictCount)
	}
	if _, err := s.GetByUUID("shared-legacy-uuid"); err != nil {
		t.Errorf("the surviving profile is not resolvable by uuid: %v", err)
	}
}

// A uuid stored with incidental whitespace must still resolve by its clean value,
// because the write path trims it to match the trimmed read paths.
func TestUUIDTrimmedOnWrite(t *testing.T) {
	s := openTestStore(t)
	saveProfile(t, s, &Profile{ID: "id-1", Type: "poster", UUID: "  padded-uuid  ", Config: mustConfig(t, map[string]any{})})

	got, err := s.Resolve("padded-uuid")
	if err != nil {
		t.Fatalf("padded uuid did not resolve by its clean value: %v", err)
	}
	if got.UUID != "padded-uuid" {
		t.Errorf("stored uuid not trimmed: %q", got.UUID)
	}
}

// An id or alias that would shadow a string another profile already resolves
// by is refused, so existing alias and uuid URLs keep their owner.
func TestSaveRefusesIdentityThatShadowsAnotherProfile(t *testing.T) {
	s := openTestStore(t)
	saveProfile(t, s, &Profile{ID: "owner", Type: "poster", Alias: "victim", UUID: "v2-legacy-uuid", Config: mustConfig(t, map[string]any{})})

	cases := []struct {
		name string
		p    Profile
		want error
	}{
		{"id equals alias", Profile{ID: "victim", Type: "poster"}, ErrConflict},
		{"id equals alias in another case", Profile{ID: "VICTIM", Type: "poster"}, ErrConflict},
		{"id equals uuid", Profile{ID: "v2-legacy-uuid", Type: "poster"}, ErrConflict},
		{"alias equals id", Profile{ID: "other", Type: "poster", Alias: "owner"}, ErrAliasTaken},
	}
	for _, tc := range cases {
		tc.p.Config = mustConfig(t, map[string]any{})
		if err := s.Save(&tc.p); !errors.Is(err, tc.want) {
			t.Errorf("%s: Save err = %v, want %v", tc.name, err, tc.want)
		}
	}
	for _, key := range []string{"victim", "v2-legacy-uuid"} {
		got, err := s.Resolve(key)
		if err != nil || got.ID != "owner" {
			t.Errorf("Resolve(%q) = %v, %v; want owner", key, got, err)
		}
	}
}

func TestUpdateRefusesAliasThatIsAnotherProfilesID(t *testing.T) {
	s := openTestStore(t)
	saveProfile(t, s, &Profile{ID: "owner", Type: "poster", Config: mustConfig(t, map[string]any{})})
	saveProfile(t, s, &Profile{ID: "other", Type: "poster", Config: mustConfig(t, map[string]any{})})
	other, err := s.Get("other")
	if err != nil {
		t.Fatal(err)
	}
	other.Alias = "owner"
	if err := s.Update(other); !errors.Is(err, ErrAliasTaken) {
		t.Errorf("Update err = %v, want ErrAliasTaken", err)
	}
	other.Alias = "fresh"
	if err := s.Update(other); err != nil {
		t.Errorf("a free alias was refused: %v", err)
	}
	if err := s.Update(other); err != nil {
		t.Errorf("re-saving a profile's own alias was refused: %v", err)
	}
}
