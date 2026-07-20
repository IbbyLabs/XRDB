// Package settings provides a simple key-value store backed by SQLite.
// Used for persisting provider API keys and other runtime-configurable options.
package settings

import (
	"database/sql"
	"errors"
	"fmt"

	_ "modernc.org/sqlite"
)

// LogLevelKey is the settings key holding the operator-chosen log level. It is
// named here so the startup restore and the admin handler cannot drift apart.
const LogLevelKey = "log_level"

// MemoryLimitKey holds the operator-chosen soft heap limit, in whole MiB. Same
// startup-restore and admin-handler contract as LogLevelKey.
const MemoryLimitKey = "memory_limit_mb"

// ErrNotFound is returned when a key does not exist.
var ErrNotFound = errors.New("settings: key not found")

// Store is the settings key-value store.
type Store struct {
	db *sql.DB
}

// Open opens or creates a settings table in the given SQLite database file.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_journal=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("settings: open db: %w", err)
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(1)
	if err := applySchema(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("settings: apply schema: %w", err)
	}
	return &Store{db: db}, nil
}

// Close releases the database connection.
func (s *Store) Close() error { return s.db.Close() }

func applySchema(db *sql.DB) error {
	_, err := db.Exec(`CREATE TABLE IF NOT EXISTS settings (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	)`)
	return err
}

// Get returns the value for key. Returns ErrNotFound if absent.
func (s *Store) Get(key string) (string, error) {
	var val string
	err := s.db.QueryRow(`SELECT value FROM settings WHERE key = ?`, key).Scan(&val)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("settings get %q: %w", key, err)
	}
	return val, nil
}

// Set upserts a key-value pair.
func (s *Store) Set(key, value string) error {
	_, err := s.db.Exec(
		`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		key, value,
	)
	if err != nil {
		return fmt.Errorf("settings set %q: %w", key, err)
	}
	return nil
}

// Delete removes a key. No-op if absent.
func (s *Store) Delete(key string) error {
	_, err := s.db.Exec(`DELETE FROM settings WHERE key = ?`, key)
	if err != nil {
		return fmt.Errorf("settings delete %q: %w", key, err)
	}
	return nil
}

// All returns all key-value pairs as a map.
func (s *Store) All() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM settings ORDER BY key`)
	if err != nil {
		return nil, fmt.Errorf("settings all: %w", err)
	}
	defer rows.Close()
	out := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}
