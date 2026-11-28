package profile

import (
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestATraktLinkIsSealedAndRoundTrips(t *testing.T) {
	s, path := storeWithKey(t)
	p := &Profile{ID: "linked", Type: "poster", Config: json.RawMessage(`{}`)}
	if err := s.Save(p); err != nil {
		t.Fatal(err)
	}
	want := &TraktAuth{AccessToken: "access-token-value", RefreshToken: "refresh-token-value", ExpiresAt: 1234}
	if err := s.SetTraktAuth(p.ID, want); err != nil {
		t.Fatal(err)
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = db.Close() }()
	var stored string
	if err := db.QueryRow(`SELECT trakt_auth FROM profiles WHERE id = ?`, p.ID).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored == "" || strings.Contains(stored, "access-token-value") || strings.Contains(stored, "refresh-token-value") {
		t.Fatalf("the stored link is readable: %q", stored)
	}

	got, err := s.TraktAuth(p.ID)
	if err != nil || got == nil || *got != *want {
		t.Fatalf("read back %+v, %v; want %+v", got, err, want)
	}
	if !got.Linked() {
		t.Error("a link with both tokens does not report linked")
	}
}

func TestAProfileEditKeepsTheTraktLink(t *testing.T) {
	s, _ := storeWithKey(t)
	p := &Profile{ID: "keeps", Type: "poster", Config: json.RawMessage(`{}`)}
	if err := s.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTraktAuth(p.ID, &TraktAuth{AccessToken: "a", RefreshToken: "r"}); err != nil {
		t.Fatal(err)
	}
	p.Config = json.RawMessage(`{"size":"large"}`)
	if err := s.Update(p); err != nil {
		t.Fatal(err)
	}
	got, err := s.TraktAuth(p.ID)
	if err != nil || !got.Linked() {
		t.Fatalf("after an edit the link is %+v, %v", got, err)
	}
}

func TestClearingATraktLinkLeavesNothing(t *testing.T) {
	s, _ := storeWithKey(t)
	p := &Profile{ID: "clears", Type: "poster", Config: json.RawMessage(`{}`)}
	if err := s.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTraktAuth(p.ID, &TraktAuth{AccessToken: "a", RefreshToken: "r"}); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTraktAuth(p.ID, nil); err != nil {
		t.Fatal(err)
	}
	if got, err := s.TraktAuth(p.ID); err != nil || got != nil {
		t.Fatalf("a cleared link reads back as %+v, %v", got, err)
	}
	if err := s.SetTraktAuth("missing", &TraktAuth{AccessToken: "a"}); !errors.Is(err, ErrNotFound) {
		t.Errorf("linking a missing profile: %v, want ErrNotFound", err)
	}
}

func TestATraktLinkIsRefusedWithoutAnEncryptionKey(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "p.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	p := &Profile{ID: "nokey", Type: "poster", Config: json.RawMessage(`{}`)}
	if err := s.Save(p); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTraktAuth(p.ID, &TraktAuth{AccessToken: "a", RefreshToken: "r"}); !errors.Is(err, ErrNoEncryptionKey) {
		t.Fatalf("got %v, want ErrNoEncryptionKey", err)
	}
}
