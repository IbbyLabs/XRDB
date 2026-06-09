package profile

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

const schemaVersion = 1

// Profile is the canonical profile record.
type Profile struct {
	ID        string          `json:"id"`
	Name      string          `json:"name,omitempty"`
	Type      string          `json:"type"`
	UUID      string          `json:"uuid,omitempty"`
	Config    json.RawMessage `json:"config"`
	Version   int             `json:"version"`
	CreatedAt string          `json:"createdAt"`
	UpdatedAt string          `json:"updatedAt"`
}

// ErrNotFound is returned when a requested profile does not exist.
var ErrNotFound = errors.New("profile not found")

// ErrConflict is returned when a profile ID already exists on Save.
var ErrConflict = errors.New("profile already exists")

// Store provides SQLite-backed profile persistence.
type Store struct {
	db *sql.DB
}

// Open opens (or creates) the SQLite database at path and applies the schema.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	if err := applySchema(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return &Store{db: db}, nil
}

// Close closes the underlying database connection.
func (s *Store) Close() error {
	return s.db.Close()
}

func applySchema(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS profiles (
			id         TEXT    NOT NULL PRIMARY KEY,
			name       TEXT    NOT NULL DEFAULT '',
			type       TEXT    NOT NULL,
			uuid       TEXT    NOT NULL DEFAULT '',
			config     TEXT    NOT NULL DEFAULT '{}',
			version    INTEGER NOT NULL DEFAULT 1,
			created_at TEXT    NOT NULL,
			updated_at TEXT    NOT NULL
		) STRICT;
	`)
	return err
}

// Save inserts a new profile. Returns ErrConflict if the ID already exists.
func (s *Store) Save(p *Profile) error {
	if p.ID == "" {
		return errors.New("profile id is required")
	}
	if p.Type == "" {
		return errors.New("profile type is required")
	}
	cfg, err := normalizeConfig(p.Config)
	if err != nil {
		return fmt.Errorf("invalid config: %w", err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	p.Version = schemaVersion
	p.CreatedAt = now
	p.UpdatedAt = now

	_, err = s.db.Exec(
		`INSERT INTO profiles (id, name, type, uuid, config, version, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Type, p.UUID, string(cfg), p.Version, p.CreatedAt, p.UpdatedAt,
	)
	if err != nil {
		if isConflict(err) {
			return ErrConflict
		}
		return fmt.Errorf("insert profile: %w", err)
	}
	return nil
}

// Get retrieves a profile by ID. Returns ErrNotFound if it does not exist.
func (s *Store) Get(id string) (*Profile, error) {
	row := s.db.QueryRow(
		`SELECT id, name, type, uuid, config, version, created_at, updated_at
		 FROM profiles WHERE id = ?`, id,
	)
	return scanProfile(row)
}

// Update replaces config, name, uuid, and updated_at for an existing profile.
// Returns ErrNotFound if the profile does not exist.
func (s *Store) Update(p *Profile) error {
	if p.ID == "" {
		return errors.New("profile id is required")
	}
	cfg, err := normalizeConfig(p.Config)
	if err != nil {
		return fmt.Errorf("invalid config: %w", err)
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	p.UpdatedAt = now

	res, err := s.db.Exec(
		`UPDATE profiles SET name = ?, uuid = ?, config = ?, updated_at = ?
		 WHERE id = ?`,
		p.Name, p.UUID, string(cfg), now, p.ID,
	)
	if err != nil {
		return fmt.Errorf("update profile: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// ExportEnvelope is the canonical export format for one or more profiles.
type ExportEnvelope struct {
	Version  int       `json:"version"`
	Profiles []Profile `json:"profiles"`
}

// List returns all profiles ordered by created_at ascending.
func (s *Store) List() ([]*Profile, error) {
	rows, err := s.db.Query(
		`SELECT id, name, type, uuid, config, version, created_at, updated_at
		 FROM profiles ORDER BY created_at ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list profiles: %w", err)
	}
	defer rows.Close()
	var out []*Profile
	for rows.Next() {
		var p Profile
		var cfgStr string
		if err := rows.Scan(&p.ID, &p.Name, &p.Type, &p.UUID, &cfgStr, &p.Version, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan profile: %w", err)
		}
		p.Config = json.RawMessage(cfgStr)
		out = append(out, &p)
	}
	return out, rows.Err()
}

func scanProfile(row *sql.Row) (*Profile, error) {
	var p Profile
	var cfgStr string
	err := row.Scan(&p.ID, &p.Name, &p.Type, &p.UUID, &cfgStr, &p.Version, &p.CreatedAt, &p.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan profile: %w", err)
	}
	p.Config = json.RawMessage(cfgStr)
	return &p, nil
}

func normalizeConfig(raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		return json.RawMessage(`{}`), nil
	}
	var check any
	if err := json.Unmarshal(raw, &check); err != nil {
		return nil, err
	}
	return raw, nil
}

func isConflict(err error) bool {
	if err == nil {
		return false
	}
	return contains(err.Error(), "UNIQUE constraint failed") ||
		contains(err.Error(), "constraint failed: profiles.id")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsStr(s, substr))
}

func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
