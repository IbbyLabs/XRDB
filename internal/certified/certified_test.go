package certified

import "testing"

// The file is keyed on IMDb ids and its coverage is partial by design, so
// "not found" and "not certified" are different answers and a caller has to be
// able to tell them apart (FR-158/161).
func TestNotFoundAndNotCertifiedAreDifferentAnswers(t *testing.T) {
	// tt0000000 is not an id any title holds, so no refresh can add it.
	const absent = "tt0000000"

	if _, known := Is(absent); known {
		t.Error("a title the file does not name claims to be known")
	}
	if isCert, _ := Is(absent); isCert {
		t.Error("a title the file does not name was certified")
	}
	if _, known := Is(""); known {
		t.Error("an empty id was answered")
	}

	// The control. A miss must mean absence rather than a file that never
	// loaded; the id comes from the file so this holds at any coverage.
	load()
	if len(loaded.Titles) == 0 {
		t.Skip("the file names no titles, so the control cannot run")
	}
	for id := range loaded.Titles {
		if _, known := Is(id); !known {
			t.Errorf("%s is in the file and was not found", id)
		}
		break
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
