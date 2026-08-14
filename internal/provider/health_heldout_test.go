package provider

import "testing"

// The counter answers "how many renders lost a rating". A hold-out that found a
// remembered value is a rescue and belongs in staleServes, not here.
func TestHeldOutEmptyIsSplitByKeyAndGate(t *testing.T) {
	h := NewHealthTracker(0, 0)

	h.NoteHeldOutEmpty("mdblist", "governor_backlog", false)
	h.NoteHeldOutEmpty("mdblist", "governor_backlog", false)
	h.NoteHeldOutEmpty("mdblist", "upstream_refusal", false)
	h.NoteHeldOutEmpty("mdblist", "governor_backlog", true)

	var got SourceHealth
	for _, s := range h.Snapshot() {
		if s.Source == "mdblist" {
			got = s
		}
	}

	if got.HeldOutEmpty["governor_backlog"] != 2 {
		t.Errorf("shared governor_backlog = %d, want 2", got.HeldOutEmpty["governor_backlog"])
	}
	if got.HeldOutEmpty["upstream_refusal"] != 1 {
		t.Errorf("shared upstream_refusal = %d, want 1", got.HeldOutEmpty["upstream_refusal"])
	}
	// The owner-keyed one must not be in the shared tally, or a change in our own
	// pacing would be invisible under other people's spent allowances.
	if got.HeldOutEmptyOwnerKeyed["governor_backlog"] != 1 {
		t.Errorf("owner-keyed = %d, want 1", got.HeldOutEmptyOwnerKeyed["governor_backlog"])
	}
	if len(got.HeldOutEmptyOwnerKeyed) != 1 {
		t.Errorf("owner-keyed tally has %d gates, want 1", len(got.HeldOutEmptyOwnerKeyed))
	}
}

// A snapshot must not be a handle on tracker state.
func TestHeldOutEmptySnapshotIsACopy(t *testing.T) {
	h := NewHealthTracker(0, 0)
	h.NoteHeldOutEmpty("simkl", "cooldown", false)

	first := h.Snapshot()[0]
	first.HeldOutEmpty["cooldown"] = 999

	second := h.Snapshot()[0]
	if second.HeldOutEmpty["cooldown"] != 1 {
		t.Errorf("tracker state = %d after mutating a snapshot, want 1", second.HeldOutEmpty["cooldown"])
	}
}

// Empty means absent, so an untouched source does not serialise an empty object.
func TestHeldOutEmptyIsOmittedWhenNothingWasLost(t *testing.T) {
	h := NewHealthTracker(0, 0)
	h.Success("tmdb", "k", &MediaMeta{Ratings: []Rating{{Source: "tmdb"}}})
	for _, s := range h.Snapshot() {
		if s.Source == "tmdb" && s.HeldOutEmpty != nil {
			t.Errorf("HeldOutEmpty = %v for a source that lost nothing, want nil", s.HeldOutEmpty)
		}
	}
}

// The endpoint's reading — a source present with no HeldOutEmpty lost nothing —
// holds only while a source appears once it has been asked and not before. That
// is a property of stateLocked, so it is asserted here rather than left to a
// comment: anyone pre-registering sources at startup breaks the reading from a
// different file and would otherwise see nothing fail.
func TestASourceAppearsOnlyOnceItHasBeenAsked(t *testing.T) {
	h := NewHealthTracker(0, 0)
	if got := h.Snapshot(); len(got) != 0 {
		t.Fatalf("a fresh tracker reported %d sources, want 0", len(got))
	}

	h.NoteHeldOutEmpty("mdblist", "governor_backlog", false)
	got := h.Snapshot()
	if len(got) != 1 || got[0].Source != "mdblist" {
		t.Fatalf("after one source was asked, snapshot = %+v, want just mdblist", got)
	}
}
