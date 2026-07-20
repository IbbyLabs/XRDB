package profile

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	_ "modernc.org/sqlite"
	"golang.org/x/crypto/bcrypt"
)

const schemaVersion = 1

// Profile is the canonical profile record.
type Profile struct {
	ID           string          `json:"id"`
	Name         string          `json:"name,omitempty"`
	Alias        string          `json:"alias,omitempty"` // memorable lowercase handle, unique
	Type         string          `json:"type"`
	UUID         string          `json:"uuid,omitempty"`
	Config       json.RawMessage `json:"config"`
	Version      int             `json:"version"`
	CreatedAt    string          `json:"createdAt"`
	UpdatedAt    string          `json:"updatedAt"`
	PasswordHash string          `json:"-"` // bcrypt hash; empty = no password
	HasPassword  bool            `json:"hasPassword"`
}

// ErrWrongPassword is returned when a password-protected profile is accessed with an incorrect password.
var ErrWrongPassword = errors.New("wrong password")

// ErrNotFound is returned when a requested profile does not exist.
var ErrNotFound = errors.New("profile not found")

// ErrConflict is returned when a profile ID already exists on Save.
var ErrConflict = errors.New("profile already exists")

// ErrAliasTaken is returned when the requested alias belongs to another profile.
var ErrAliasTaken = errors.New("alias already in use")

// ErrInvalidAlias is returned for aliases that aren't 3-32 lowercase letters.
var ErrInvalidAlias = errors.New("alias must be 3-32 lowercase letters (a-z only)")

var aliasRe = regexp.MustCompile(`^[a-z]{3,32}$`)

// ValidAlias reports whether alias is acceptable: lowercase letters only.
func ValidAlias(alias string) bool { return aliasRe.MatchString(alias) }

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
			id            TEXT    NOT NULL PRIMARY KEY,
			name          TEXT    NOT NULL DEFAULT '',
			type          TEXT    NOT NULL,
			uuid          TEXT    NOT NULL DEFAULT '',
			config        TEXT    NOT NULL DEFAULT '{}',
			version       INTEGER NOT NULL DEFAULT 1,
			created_at    TEXT    NOT NULL,
			updated_at    TEXT    NOT NULL,
			password_hash TEXT    NOT NULL DEFAULT ''
		) STRICT;
	`)
	if err != nil {
		return err
	}
	// Migrate existing databases that don't have the password_hash column yet.
	_, _ = db.Exec(`ALTER TABLE profiles ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`)
	// Alias column + uniqueness (empty aliases are exempt via partial index).
	_, _ = db.Exec(`ALTER TABLE profiles ADD COLUMN alias TEXT NOT NULL DEFAULT ''`)
	_, _ = db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_alias ON profiles(alias) WHERE alias != ''`)
	// Index the uuid so migrated v2 config-string URLs (?config=<uuid>) resolve
	// without a table scan. Not unique: a uuid is a legacy identity, and two
	// profiles sharing one would be a migration bug we do not want to hard-fail.
	_, _ = db.Exec(`CREATE INDEX IF NOT EXISTS idx_profiles_uuid ON profiles(uuid) WHERE uuid != ''`)
	return nil
}

// validateAlias normalizes and checks an alias; empty is allowed (no alias).
func validateAlias(alias string) (string, error) {
	alias = strings.ToLower(strings.TrimSpace(alias))
	if alias == "" {
		return "", nil
	}
	if !ValidAlias(alias) {
		return "", ErrInvalidAlias
	}
	return alias, nil
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
	alias, err := validateAlias(p.Alias)
	if err != nil {
		return err
	}
	p.Alias = alias
	now := time.Now().UTC().Format(time.RFC3339Nano)
	p.Version = schemaVersion
	p.CreatedAt = now
	p.UpdatedAt = now

	_, err = s.db.Exec(
		`INSERT INTO profiles (id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Alias, p.Type, p.UUID, string(cfg), p.Version, p.CreatedAt, p.UpdatedAt, p.PasswordHash,
	)
	if err != nil {
		if isAliasConflict(err) {
			return ErrAliasTaken
		}
		if isConflict(err) {
			return ErrConflict
		}
		return fmt.Errorf("insert profile: %w", err)
	}
	p.HasPassword = p.PasswordHash != ""
	return nil
}

// Get retrieves a profile by ID. Returns ErrNotFound if it does not exist.
func (s *Store) Get(id string) (*Profile, error) {
	row := s.db.QueryRow(
		`SELECT id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash
		 FROM profiles WHERE id = ?`, id,
	)
	return scanProfile(row)
}

// Resolve retrieves a profile by ID, then alias, then legacy v2 uuid. The uuid
// fallback keeps live v2 artwork URLs (?config=<uuid>) working after a v3
// cutover: the uuid is preserved on migrated profiles but is not the primary
// key, so without this a valid old URL would 404 even though the data is there.
func (s *Store) Resolve(idOrAlias string) (*Profile, error) {
	p, err := s.Get(idOrAlias)
	if err == nil {
		return p, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	key := strings.ToLower(strings.TrimSpace(idOrAlias))
	row := s.db.QueryRow(
		`SELECT id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash
		 FROM profiles WHERE alias = ? AND alias != ''`, key,
	)
	p, err = scanProfile(row)
	if err == nil {
		return p, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	// Legacy uuid identity. Match the raw input, not the lowercased alias key:
	// v2 uuids are case-sensitive config strings. Pick the oldest on the vanishing
	// chance two profiles share a uuid, so resolution is deterministic.
	row = s.db.QueryRow(
		`SELECT id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash
		 FROM profiles WHERE uuid = ? AND uuid != '' ORDER BY created_at LIMIT 1`, strings.TrimSpace(idOrAlias),
	)
	return scanProfile(row)
}

// HasPassword reports whether the profile with the given ID has a password set.
func (s *Store) HasPassword(id string) (bool, error) {
	p, err := s.Get(id)
	if err != nil {
		return false, err
	}
	return p.PasswordHash != "", nil
}

// SetPassword hashes and stores a password for a profile.
// Pass an empty string to clear the password.
func (s *Store) SetPassword(id, password string) error {
	var hash string
	if password != "" {
		b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash password: %w", err)
		}
		hash = string(b)
	}
	res, err := s.db.Exec(
		`UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?`,
		hash, time.Now().UTC().Format(time.RFC3339Nano), id,
	)
	if err != nil {
		return fmt.Errorf("set password: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

// CheckPassword verifies a plaintext password against the stored hash.
// Returns nil on success, ErrWrongPassword on mismatch, ErrNotFound if
// the profile doesn't exist, or nil if the profile has no password set.
func (s *Store) CheckPassword(id, password string) error {
	p, err := s.Get(id)
	if err != nil {
		return err
	}
	if p.PasswordHash == "" {
		return nil
	}
	if err := bcrypt.CompareHashAndPassword([]byte(p.PasswordHash), []byte(password)); err != nil {
		return ErrWrongPassword
	}
	return nil
}

// Update replaces config, name, alias, uuid, password hash, and updated_at
// for an existing profile. Returns ErrNotFound if the profile does not exist.
func (s *Store) Update(p *Profile) error {
	if p.ID == "" {
		return errors.New("profile id is required")
	}
	cfg, err := normalizeConfig(p.Config)
	if err != nil {
		return fmt.Errorf("invalid config: %w", err)
	}
	alias, err := validateAlias(p.Alias)
	if err != nil {
		return err
	}
	p.Alias = alias
	now := time.Now().UTC().Format(time.RFC3339Nano)
	p.UpdatedAt = now

	res, err := s.db.Exec(
		`UPDATE profiles SET name = ?, alias = ?, uuid = ?, config = ?, updated_at = ?, password_hash = ?
		 WHERE id = ?`,
		p.Name, p.Alias, p.UUID, string(cfg), now, p.PasswordHash, p.ID,
	)
	if err != nil {
		if isAliasConflict(err) {
			return ErrAliasTaken
		}
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

// Delete removes a profile by ID. Returns ErrNotFound if it does not exist.
func (s *Store) Delete(id string) error {
	res, err := s.db.Exec(`DELETE FROM profiles WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete profile: %w", err)
	}
	n, _ := res.RowsAffected()
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
		`SELECT id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash
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
		if err := rows.Scan(&p.ID, &p.Name, &p.Alias, &p.Type, &p.UUID, &cfgStr, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PasswordHash); err != nil {
			return nil, fmt.Errorf("scan profile: %w", err)
		}
		p.Config = json.RawMessage(cfgStr)
		p.HasPassword = p.PasswordHash != ""
		out = append(out, &p)
	}
	return out, rows.Err()
}

func scanProfile(row *sql.Row) (*Profile, error) {
	var p Profile
	var cfgStr string
	err := row.Scan(&p.ID, &p.Name, &p.Alias, &p.Type, &p.UUID, &cfgStr, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PasswordHash)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan profile: %w", err)
	}
	p.Config = json.RawMessage(cfgStr)
	p.HasPassword = p.PasswordHash != ""
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
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "constraint failed: profiles.id")
}

func isAliasConflict(err error) bool {
	return err != nil && strings.Contains(err.Error(), "profiles.alias")
}
