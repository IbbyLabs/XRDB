package provider

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// A bare TMDB id names no kind, and the record can only be found under one of
// /movie and /tv, so answering costs a probe. The answer never changes, so it
// is worth keeping: a title does not become a series.
const (
	tmdbKindStoreFile = "tmdb-kinds.db"
	// A miss expires because it can be wrong in a way a hit cannot: an id may
	// be one TMDB has not published yet, or a typo someone corrects.
	tmdbKindMissTTL = 24 * time.Hour
)

type tmdbKindStore struct {
	db *sql.DB
}

func openTMDBKindStore(path string) (*tmdbKindStore, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open tmdb kind store: %w", err)
	}
	schema := `
		CREATE TABLE IF NOT EXISTS tmdb_kinds (
			tmdb_id TEXT PRIMARY KEY,
			kind    TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS tmdb_kind_misses (
			tmdb_id TEXT PRIMARY KEY,
			seen_at INTEGER NOT NULL
		);`
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("tmdb kind store schema: %w", err)
	}
	return &tmdbKindStore{db: db}, nil
}

func (s *tmdbKindStore) lookup(id string) (string, bool) {
	if s == nil || s.db == nil {
		return "", false
	}
	var kind string
	if err := s.db.QueryRow(`SELECT kind FROM tmdb_kinds WHERE tmdb_id = ?`, id).Scan(&kind); err != nil {
		return "", false
	}
	return kind, kind != ""
}

func (s *tmdbKindStore) remember(id, kind string) {
	if s == nil || s.db == nil || id == "" || kind == "" {
		return
	}
	_, _ = s.db.Exec(`INSERT INTO tmdb_kinds (tmdb_id, kind) VALUES (?, ?)
		ON CONFLICT(tmdb_id) DO UPDATE SET kind = excluded.kind`, id, kind)
	_, _ = s.db.Exec(`DELETE FROM tmdb_kind_misses WHERE tmdb_id = ?`, id)
}

func (s *tmdbKindStore) missedRecently(id string, now time.Time) bool {
	if s == nil || s.db == nil {
		return false
	}
	var seen int64
	if err := s.db.QueryRow(`SELECT seen_at FROM tmdb_kind_misses WHERE tmdb_id = ?`, id).Scan(&seen); err != nil {
		return false
	}
	return now.Sub(time.Unix(seen, 0)) < tmdbKindMissTTL
}

func (s *tmdbKindStore) rememberMiss(id string, now time.Time) {
	if s == nil || s.db == nil || id == "" {
		return
	}
	_, _ = s.db.Exec(`INSERT INTO tmdb_kind_misses (tmdb_id, seen_at) VALUES (?, ?)
		ON CONFLICT(tmdb_id) DO UPDATE SET seen_at = excluded.seen_at`, id, now.Unix())
}

func (s *tmdbKindStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// SetKindCachePath opens the store that keeps resolved TMDB kinds across
// restarts. Without a directory the kinds are kept for the life of the process
// instead, which still spares a render from re-probing an id it just resolved.
func (t *TMDB) SetKindCachePath(dir string, logger *slog.Logger) {
	if logger == nil {
		logger = slog.Default()
	}
	path := ":memory:"
	if dir != "" {
		path = filepath.Join(dir, tmdbKindStoreFile)
	}
	store, err := openTMDBKindStore(path)
	if err != nil {
		logger.Warn("Could not open the TMDB kind cache, so kinds will be resolved on every render",
			"error", err)
		return
	}
	if dir == "" {
		store.db.SetMaxOpenConns(1)
	}
	t.mu.Lock()
	previous := t.kinds
	t.kinds = store
	t.mu.Unlock()
	_ = previous.Close()
	logger.Info("Opened the TMDB kind cache", "path", path)
}

func (t *TMDB) kindStore() *tmdbKindStore {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.kinds
}

// KindOfTMDBID answers whether a bare TMDB id is a movie or a series, from the
// store when it can and from TMDB otherwise. An id TMDB does not hold under
// either kind is remembered as a miss, so a wrong id costs two calls once
// rather than two per render.
func (t *TMDB) KindOfTMDBID(ctx context.Context, id string) (string, error) {
	store := t.kindStore()
	if kind, ok := store.lookup(id); ok {
		return kind, nil
	}
	if store.missedRecently(id, time.Now()) {
		return "", fmt.Errorf("tmdb: %q was not found under either kind: %w", id, errNotFound)
	}
	kind, err := t.identifyTMDBID(ctx, id)
	if err != nil {
		if errors.Is(err, errNotFound) {
			store.rememberMiss(id, time.Now())
		}
		return "", err
	}
	store.remember(id, kind)
	return kind, nil
}

// identifyTMDBID asks for the record as a movie and then as a series. Only a
// 404 rules a kind out; every other refusal is returned, so a rate limit is
// never recorded as a title that does not exist.
func (t *TMDB) identifyTMDBID(ctx context.Context, id string) (string, error) {
	for _, probe := range []struct{ path, kind string }{
		{"movie", "movie"},
		{"tv", "series"},
	} {
		var out struct {
			ID int `json:"id"`
		}
		err := t.get(ctx, t.base()+"/"+probe.path+"/"+url.PathEscape(id), &out)
		if err == nil {
			if out.ID == 0 {
				continue
			}
			return probe.kind, nil
		}
		var status *tmdbStatusError
		if errors.As(err, &status) && status.Code == http.StatusNotFound {
			continue
		}
		return "", err
	}
	return "", fmt.Errorf("tmdb: no movie or series numbered %q: %w", id, errNotFound)
}
