package certified

import "testing"

// The file is keyed on IMDb ids and its coverage is partial by design, so
// "not found" and "not certified" are different answers and a caller has to be
// able to tell them apart (FR-158/161).
func TestNotFoundAndNotCertifiedAreDifferentAnswers(t *testing.T) {
	// The shipped file is empty until a refresh runs, which is the state that
	// matters most: nothing must be certified from an empty file, and nothing
	// must claim to know.
	if _, known := Is("tt0111161"); known {
		t.Error("an empty file claims to know about a title")
	}
	if isCert, _ := Is("tt0111161"); isCert {
		t.Error("an empty file certified a title")
	}
	if _, known := Is(""); known {
		t.Error("an empty id was answered")
	}
}

// The status is read from the page rather than computed, so the file holds the
// answer and this hands it back unchanged.
func TestTheFileAnswerIsUsedAsGiven(t *testing.T) {
	load()
	prev := loaded
	t.Cleanup(func() { loaded = prev })

	loaded = file{Titles: map[string]Title{
		"tt0000001": {Certified: true},
		"tt0000002": {Certified: false},
	}}
	for id, want := range map[string]bool{"tt0000001": true, "tt0000002": false} {
		got, known := Is(id)
		if !known {
			t.Errorf("%s is in the file and was not found", id)
		}
		if got != want {
			t.Errorf("%s certified = %v, want %v", id, got, want)
		}
	}
}

// A refresher that cannot reach the source leaves the last good file, so a
// reader has to be able to say how old it is rather than implying it is current.
func TestTheFileCarriesItsAge(t *testing.T) {
	load()
	prev := loaded
	t.Cleanup(func() { loaded = prev })

	loaded = file{ReadAt: "2026-09-01T07:00:00Z", Titles: map[string]Title{"tt1": {}}}
	if ReadAt().IsZero() {
		t.Error("a dated file reports no date")
	}
	loaded = file{ReadAt: "not a date"}
	if !ReadAt().IsZero() {
		t.Error("an unreadable date was accepted")
	}
}
