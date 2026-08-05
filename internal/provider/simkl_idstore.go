package provider

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// The id map does not belong in a single JSON file. It is parsed whole at
// startup and rewritten whole on every snapshot, and an id is never removed
// because it never changes, so the file only grows and the process holds all of
// it. That fits until it does not, at boot, and a rewrite interrupted halfway
// takes the whole map rather than one row.
//
// This is a database of its own rather than a table in xrdb.db. That file holds
// profiles, opens with no WAL and no busy timeout, and is capped at a single
// connection — so a hot write path there would serialise every id lookup
// against a profile read. Nothing about indexed lookup, partial expiry or an
// atomic write needs the same file, and the id map is cache rather than user
// data, so it lives beside the other caches.
const simklIDStoreFile = "simkl-ids.db"

type simklIDStore struct {
	db *sql.DB
}

// openMemorySIMKLIDStore backs an instance with no cache directory. Without it
// an unconfigured deployment resolves the same id on every render, which is the
// cost this whole thing exists to remove. One connection, so the pool cannot
// hand out a second and separate in-memory database.
func openMemorySIMKLIDStore() *simklIDStore {
	store, err := openSIMKLIDStore(":memory:")
	if err != nil {
		return nil
	}
	store.db.SetMaxOpenConns(1)
	return store
}

func openSIMKLIDStore(path string) (*simklIDStore, error) {
	// WAL so a reader is never blocked by the writer, and a busy timeout so a
	// contended write waits rather than failing the render that provoked it.
	db, err := sql.Open("sqlite", path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open simkl id store: %w", err)
	}
	schema := `
		CREATE TABLE IF NOT EXISTS simkl_ids (
			imdb_id  TEXT PRIMARY KEY,
			simkl_id TEXT NOT NULL
		);
		CREATE TABLE IF NOT EXISTS simkl_misses (
			imdb_id TEXT PRIMARY KEY,
			seen_at INTEGER NOT NULL
		);`
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("simkl id store schema: %w", err)
	}
	return &simklIDStore{db: db}, nil
}

func (s *simklIDStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

// lookup returns a stored SIMKL id. Read straight from the index rather than
// from a map held in memory, which is the point of the move.
func (s *simklIDStore) lookup(imdbID string) (string, bool) {
	if s == nil || s.db == nil {
		return "", false
	}
	var id string
	if err := s.db.QueryRow(
		`SELECT simkl_id FROM simkl_ids WHERE imdb_id = ?`, imdbID).Scan(&id); err != nil {
		return "", false
	}
	return id, id != ""
}

func (s *simklIDStore) remember(imdbID, simklID string) {
	if s == nil || s.db == nil || imdbID == "" || simklID == "" {
		return
	}
	_, _ = s.db.Exec(
		`INSERT INTO simkl_ids (imdb_id, simkl_id) VALUES (?, ?)
		 ON CONFLICT(imdb_id) DO UPDATE SET simkl_id = excluded.simkl_id`, imdbID, simklID)
}

// missedRecently reports a title SIMKL has said it does not carry, within the
// term. Expiry is a comparison in the query rather than a sweep, so nothing has
// to be loaded to age it out.
func (s *simklIDStore) missedRecently(imdbID string, now time.Time) bool {
	if s == nil || s.db == nil {
		return false
	}
	var seen int64
	if err := s.db.QueryRow(
		`SELECT seen_at FROM simkl_misses WHERE imdb_id = ?`, imdbID).Scan(&seen); err != nil {
		return false
	}
	return now.Sub(time.Unix(seen, 0)) < simklIDMissTTL
}

func (s *simklIDStore) rememberMiss(imdbID string, now time.Time) {
	if s == nil || s.db == nil || imdbID == "" {
		return
	}
	_, _ = s.db.Exec(
		`INSERT INTO simkl_misses (imdb_id, seen_at) VALUES (?, ?)
		 ON CONFLICT(imdb_id) DO UPDATE SET seen_at = excluded.seen_at`, imdbID, now.Unix())
}

// pruneMisses drops entries past the term. Only the misses need this: a
// resolved id is never wrong, so nothing removes one.
func (s *simklIDStore) pruneMisses(now time.Time) {
	if s == nil || s.db == nil {
		return
	}
	_, _ = s.db.Exec(`DELETE FROM simkl_misses WHERE seen_at < ?`,
		now.Add(-simklIDMissTTL).Unix())
}

func (s *simklIDStore) counts() (ids, misses int) {
	if s == nil || s.db == nil {
		return 0, 0
	}
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM simkl_ids`).Scan(&ids)
	_ = s.db.QueryRow(`SELECT COUNT(*) FROM simkl_misses`).Scan(&misses)
	return ids, misses
}

// importMap writes a JSON snapshot's contents in one transaction, for the
// one-time migration off the file.
func (s *simklIDStore) importMap(ids map[string]string, misses map[string]time.Time) error {
	if s == nil || s.db == nil {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for imdbID, simklID := range ids {
		if imdbID == "" || simklID == "" {
			continue
		}
		if _, err := tx.Exec(
			`INSERT OR REPLACE INTO simkl_ids (imdb_id, simkl_id) VALUES (?, ?)`,
			imdbID, simklID); err != nil {
			return err
		}
	}
	for imdbID, at := range misses {
		if imdbID == "" {
			continue
		}
		if _, err := tx.Exec(
			`INSERT OR REPLACE INTO simkl_misses (imdb_id, seen_at) VALUES (?, ?)`,
			imdbID, at.Unix()); err != nil {
			return err
		}
	}
	return tx.Commit()
}
