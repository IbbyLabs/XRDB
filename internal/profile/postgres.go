package profile

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5/stdlib"
)

// Postgres-backed profile storage.
//
// Everything else this process writes to disk -- the settings table, the SIMKL
// and TMDB id caches, the render cache, the daily-budget snapshot -- is a cache
// that rebuilds itself. Profiles are not: an alias travels in an artwork URL
// that someone has already pasted into Stremio, so losing the table breaks
// every poster that URL feeds. It is the one piece of state that has to outlive
// any single container, and therefore the one piece that stops several replicas
// from sharing a service.
//
// Setting XRDB_PROFILE_DSN to a postgres DSN moves that one table, and nothing
// else, off SQLite. Unset, the store behaves exactly as it did.

// profileDSNEnv names the setting. A postgres DSN here and the profile store
// runs on postgres; empty and XRDB_DB's SQLite file is used as before.
const profileDSNEnv = "XRDB_PROFILE_DSN"

// postgresDriverName is the driver registered by registerPostgresDriver.
const postgresDriverName = "xrdb-pgx-rebind"

// postgresDSNFromEnv returns the configured DSN, or "" when the store should
// stay on SQLite.
func postgresDSNFromEnv() string {
	dsn := strings.TrimSpace(os.Getenv(profileDSNEnv))
	if dsn == "" {
		return ""
	}
	if !isPostgresDSN(dsn) {
		// Not a fatal error here: Open reports it, with the variable named.
		return dsn
	}
	return dsn
}

func isPostgresDSN(s string) bool {
	return strings.HasPrefix(s, "postgres://") || strings.HasPrefix(s, "postgresql://")
}

// rebind rewrites the ? placeholders every statement in this package is written
// with into postgres' $1..$n.
//
// Quoted text is skipped so that a ? inside a string literal is left alone.
// Nothing in this package has one today; the scanner exists so that adding one
// later is not a silent corruption. ” inside a single-quoted string is
// SQL's own escape for a quote and simply toggles back and forth, which the
// state machine handles without a special case. Dollar-quoted bodies ($$...$$)
// are not recognised because this package writes none.
func rebind(query string) string {
	var b strings.Builder
	b.Grow(len(query) + 8)
	n := 0
	inSingle, inDouble := false, false
	for i := 0; i < len(query); i++ {
		c := query[i]
		switch {
		case inSingle:
			if c == '\'' {
				inSingle = false
			}
		case inDouble:
			if c == '"' {
				inDouble = false
			}
		case c == '\'':
			inSingle = true
		case c == '"':
			inDouble = true
		case c == '?':
			n++
			b.WriteByte('$')
			b.WriteString(strconv.Itoa(n))
			continue
		}
		b.WriteByte(c)
	}
	return b.String()
}

// rebindDriver wraps pgx's driver so that every statement is rewritten on its
// way to the server.
type rebindDriver struct{ base driver.Driver }

func (d rebindDriver) Open(dsn string) (driver.Conn, error) {
	c, err := d.base.Open(dsn)
	if err != nil {
		return nil, err
	}
	return &rebindConn{inner: c}, nil
}

// rebindConn implements driver.Conn and *only* driver.Conn, which is the whole
// trick and the one thing to preserve when touching this.
//
// database/sql reaches for ExecerContext and QueryerContext before it falls
// back to Prepare. A conn that does not offer them sends every statement
// through Prepare, which is the single place the rewrite has to live -- so no
// caller in this package has to change, and an upstream edit to any of the
// SQL applies without touching this file.
//
// Embedding driver.Conn instead of wrapping it would promote pgx's own
// ExecContext and QueryContext onto this type, database/sql would use those in
// preference, and the ? placeholders would reach postgres unrewritten and fail.
// The field is named rather than embedded on purpose.
type rebindConn struct{ inner driver.Conn }

func (c *rebindConn) Prepare(query string) (driver.Stmt, error) {
	return c.inner.Prepare(rebind(query))
}

func (c *rebindConn) Close() error { return c.inner.Close() }

//nolint:staticcheck // driver.Conn requires Begin; database/sql uses it when ConnBeginTx is absent.
func (c *rebindConn) Begin() (driver.Tx, error) { return c.inner.Begin() }

var registerOnce sync.Once

func registerPostgresDriver() {
	registerOnce.Do(func() {
		sql.Register(postgresDriverName, rebindDriver{base: stdlib.GetDefaultDriver()})
	})
}

// schemaAdvisoryLock is an arbitrary constant, shared by every replica, that
// serialises schema application. Several pods start at once on a rollout and
// postgres' CREATE ... IF NOT EXISTS is not itself safe against a concurrent
// identical create: it can still fail on a duplicate pg_type or relation. The
// lock is session-scoped and released explicitly below.
const schemaAdvisoryLock = 4823102 // "xrdb profiles"

func openPostgres(dsn string) (*Store, error) {
	if !isPostgresDSN(dsn) {
		return nil, fmt.Errorf("%s must be a postgres:// or postgresql:// DSN", profileDSNEnv)
	}
	registerPostgresDriver()
	db, err := sql.Open(postgresDriverName, dsn)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}
	// Unlike SQLite, which is serialised to one connection, postgres is the
	// shared resource several replicas contend for. Keep the per-replica pool
	// small enough that a fleet of them stays inside the pooler's budget.
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("reach postgres: %w", err)
	}
	if err := applySchemaPostgres(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("apply postgres schema: %w", err)
	}
	return &Store{db: db}, nil
}

func applySchemaPostgres(db *sql.DB) error {
	// One dedicated connection for the whole of this, and it matters.
	//
	// pg_advisory_lock is held by the SESSION that took it. db.Exec borrows a
	// connection from the pool and gives it back, so a lock taken by one Exec
	// and released by the next can easily be two different sessions: the
	// unlock then returns false against a lock it does not hold, and the real
	// lock stays held on an idle pooled connection that never closes. Every
	// other replica blocks on it forever and crashloops. Taking a *sql.Conn
	// pins one session for the lock, the DDL and the unlock alike.
	ctx := context.Background()
	conn, err := db.Conn(ctx)
	if err != nil {
		return fmt.Errorf("reserve a connection for the schema lock: %w", err)
	}
	defer func() { _ = conn.Close() }()

	if _, err := conn.ExecContext(ctx, `SELECT pg_advisory_lock(`+strconv.Itoa(schemaAdvisoryLock)+`)`); err != nil {
		return fmt.Errorf("take schema lock: %w", err)
	}
	defer func() {
		// Best effort: closing the connection would drop the lock anyway, but
		// releasing it explicitly returns the session to the pool usable.
		_, _ = conn.ExecContext(ctx, `SELECT pg_advisory_unlock(`+strconv.Itoa(schemaAdvisoryLock)+`)`)
	}()

	// The columns the SQLite path adds by ALTER are declared here directly: a
	// postgres database is only ever created by this code, so there is no
	// pre-alias table to migrate. The ADD COLUMN IF NOT EXISTS statements below
	// still run, so that a database created by an earlier build of this patch
	// picks up anything added since.
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS profiles (
			id            TEXT   NOT NULL PRIMARY KEY,
			name          TEXT   NOT NULL DEFAULT '',
			type          TEXT   NOT NULL,
			uuid          TEXT   NOT NULL DEFAULT '',
			config        TEXT   NOT NULL DEFAULT '{}',
			version       BIGINT NOT NULL DEFAULT 1,
			created_at    TEXT   NOT NULL,
			updated_at    TEXT   NOT NULL,
			password_hash TEXT   NOT NULL DEFAULT '',
			alias         TEXT   NOT NULL DEFAULT '',
			provider_keys TEXT   NOT NULL DEFAULT '{}',
			preview       TEXT   NOT NULL DEFAULT ''
		)`,
		`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS alias TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS provider_keys TEXT NOT NULL DEFAULT '{}'`,
		`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preview TEXT NOT NULL DEFAULT ''`,
		// Partial unique indexes, exactly as the SQLite path builds them: an
		// empty alias or uuid is exempt, so unaliased profiles do not collide.
		// The SQLite path drops idx_profiles_uuid first, to replace a
		// non-unique index left by an older schema. No postgres database has
		// ever had that index non-unique, and dropping it on every start would
		// leave a window with no constraint while three replicas roll, so the
		// drop is deliberately not carried over.
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_alias ON profiles(alias) WHERE alias <> ''`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_uuid ON profiles(uuid) WHERE uuid <> ''`,
	}
	for _, stmt := range stmts {
		if _, err := conn.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("%w (running: %.60s)", err, strings.Join(strings.Fields(stmt), " "))
		}
	}
	return nil
}
