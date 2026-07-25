package profile

import (
	"crypto/cipher"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
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
	// ProviderKeys holds the owner's own API keys, used in place of the
	// server's for their renders. Never serialized: an unprotected profile is
	// readable by anyone holding its id, so the values only ever travel inward.
	// KeysSet names which are configured so the UI can show that without them.
	ProviderKeys map[string]string `json:"-"`
	KeysSet      []string          `json:"keysSet,omitempty"`
	// VersionToken changes whenever the profile is edited. Artwork URLs carry
	// it so an edit produces a different URL: Stremio caches poster images for
	// 24-48h client-side no matter what TTL the server sends, so changing the
	// URL is the only reliable way to make an edit visible.
	VersionToken string `json:"versionToken"`
}

// versionToken derives the short URL token for a profile revision. It hashes
// the id alongside the timestamp so two profiles saved in the same instant
// still get distinct tokens.
func versionToken(id, updatedAt string) string {
	sum := sha256.Sum256([]byte(id + "|" + updatedAt))
	return hex.EncodeToString(sum[:])[:8]
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
	// aead encrypts provider credentials at rest; nil means the store cannot
	// hold them. See secrets.go.
	aead cipher.AEAD
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
	// The owner's own provider API keys, as a JSON object.
	_, _ = db.Exec(`ALTER TABLE profiles ADD COLUMN provider_keys TEXT NOT NULL DEFAULT '{}'`)
	_, _ = db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_alias ON profiles(alias) WHERE alias != ''`)
	// Index the uuid so migrated v2 config-string URLs (?config=<uuid>) resolve
	// without a table scan, and make it unique so import stays idempotent even
	// under concurrent requests: a second insert of the same legacy identity
	// fails the constraint and is skipped rather than duplicating the profile.
	// Empty uuids (v3-native profiles) are exempt via the partial predicate.
	// Replace any earlier non-unique index from before uniqueness was enforced.
	_, _ = db.Exec(`DROP INDEX IF EXISTS idx_profiles_uuid`)
	_, _ = db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_uuid ON profiles(uuid) WHERE uuid != ''`)
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
	// Store the uuid trimmed so it matches the trimmed key every read path uses;
	// otherwise a padded stored uuid would silently fail both URL resolution and
	// import de-duplication.
	p.UUID = strings.TrimSpace(p.UUID)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	p.Version = schemaVersion
	p.CreatedAt = now
	p.UpdatedAt = now

	sealedKeys, err := s.encodeProviderKeys(p.ProviderKeys)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO profiles (id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash, provider_keys)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.Alias, p.Type, p.UUID, string(cfg), p.Version, p.CreatedAt, p.UpdatedAt, p.PasswordHash, sealedKeys,
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
	p.VersionToken = versionToken(p.ID, p.UpdatedAt)
	return nil
}

// Get retrieves a profile by ID. Returns ErrNotFound if it does not exist.
func (s *Store) Get(id string) (*Profile, error) {
	row := s.db.QueryRow(
		`SELECT id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash, provider_keys
		 FROM profiles WHERE id = ?`, id,
	)
	return s.scanProfile(row)
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
		`SELECT id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash, provider_keys
		 FROM profiles WHERE alias = ? AND alias != ''`, key,
	)
	p, err = s.scanProfile(row)
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
		`SELECT id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash, provider_keys
		 FROM profiles WHERE uuid = ? AND uuid != '' ORDER BY created_at, id LIMIT 1`, strings.TrimSpace(idOrAlias),
	)
	return s.scanProfile(row)
}

// GetByUUID retrieves the oldest profile carrying the given legacy v2 uuid, or
// ErrNotFound if none does. An empty uuid never matches. Used by import to stay
// idempotent: a profile whose uuid is already present is a re-import, not a new
// profile.
func (s *Store) GetByUUID(uuid string) (*Profile, error) {
	uuid = strings.TrimSpace(uuid)
	if uuid == "" {
		return nil, ErrNotFound
	}
	row := s.db.QueryRow(
		`SELECT id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash, provider_keys
		 FROM profiles WHERE uuid = ? AND uuid != '' ORDER BY created_at, id LIMIT 1`, uuid,
	)
	return s.scanProfile(row)
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
	p.UUID = strings.TrimSpace(p.UUID)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	p.UpdatedAt = now

	sealedKeys, err := s.encodeProviderKeys(p.ProviderKeys)
	if err != nil {
		return err
	}
	res, err := s.db.Exec(
		`UPDATE profiles SET name = ?, alias = ?, uuid = ?, config = ?, updated_at = ?, password_hash = ?, provider_keys = ?
		 WHERE id = ?`,
		p.Name, p.Alias, p.UUID, string(cfg), now, p.PasswordHash, sealedKeys, p.ID,
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
		`SELECT id, name, alias, type, uuid, config, version, created_at, updated_at, password_hash, provider_keys
		 FROM profiles ORDER BY created_at ASC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list profiles: %w", err)
	}
	defer rows.Close()
	var out []*Profile
	for rows.Next() {
		var p Profile
		var cfgStr, keysStr string
		if err := rows.Scan(&p.ID, &p.Name, &p.Alias, &p.Type, &p.UUID, &cfgStr, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PasswordHash, &keysStr); err != nil {
			return nil, fmt.Errorf("scan profile: %w", err)
		}
		p.Config = json.RawMessage(cfgStr)
		p.HasPassword = p.PasswordHash != ""
		p.ProviderKeys = s.decodeProviderKeys(keysStr)
		p.KeysSet = configuredKeyNames(p.ProviderKeys)
		p.VersionToken = versionToken(p.ID, p.UpdatedAt)
		out = append(out, &p)
	}
	return out, rows.Err()
}

func (s *Store) scanProfile(row *sql.Row) (*Profile, error) {
	var p Profile
	var cfgStr, keysStr string
	err := row.Scan(&p.ID, &p.Name, &p.Alias, &p.Type, &p.UUID, &cfgStr, &p.Version, &p.CreatedAt, &p.UpdatedAt, &p.PasswordHash, &keysStr)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("scan profile: %w", err)
	}
	p.Config = json.RawMessage(cfgStr)
	p.HasPassword = p.PasswordHash != ""
	p.ProviderKeys = s.decodeProviderKeys(keysStr)
	p.KeysSet = configuredKeyNames(p.ProviderKeys)
	p.VersionToken = versionToken(p.ID, p.UpdatedAt)
	return &p, nil
}

// encodeProviderKeys serializes the owner's keys for storage, dropping blanks
// so clearing one leaves nothing behind.
func (s *Store) encodeProviderKeys(keys map[string]string) (string, error) {
	trimmed := make(map[string]string, len(keys))
	for k, v := range keys {
		if v = strings.TrimSpace(v); v != "" {
			trimmed[k] = v
		}
	}
	if len(trimmed) == 0 {
		return "", nil
	}
	b, err := json.Marshal(trimmed)
	if err != nil {
		return "", fmt.Errorf("encode provider keys: %w", err)
	}
	return s.sealSecret(string(b))
}

func (s *Store) decodeProviderKeys(stored string) map[string]string {
	plain := s.openSecret(stored)
	if plain == "" {
		return nil
	}
	var out map[string]string
	if err := json.Unmarshal([]byte(plain), &out); err != nil {
		return nil
	}
	return out
}

// configuredKeyNames lists which providers have a key, so the UI can show that
// without the values ever leaving the server.
func configuredKeyNames(keys map[string]string) []string {
	if len(keys) == 0 {
		return nil
	}
	out := make([]string, 0, len(keys))
	for k, v := range keys {
		if strings.TrimSpace(v) != "" {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
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
