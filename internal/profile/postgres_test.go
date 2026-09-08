package profile

import (
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"
)

// These run against a real postgres, because the thing under test is the
// dialect boundary: placeholder rewriting, the schema, and which error text
// postgres uses for a unique violation. A fake would assert my guesses rather
// than postgres' behaviour, which is exactly what this needs to catch.
//
// Point XRDB_TEST_POSTGRES_DSN at a scratch database to run them:
//
//	docker run -d --name pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=xrdb \
//	  -p 55432:5432 postgres:17-alpine
//	XRDB_TEST_POSTGRES_DSN=postgres://postgres:test@127.0.0.1:55432/xrdb?sslmode=disable \
//	  go test ./internal/profile/ -run Postgres
func postgresStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("XRDB_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("XRDB_TEST_POSTGRES_DSN is not set")
	}
	s, err := openPostgres(dsn)
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	t.Cleanup(func() {
		if _, err := s.db.Exec(`TRUNCATE profiles`); err != nil {
			t.Errorf("truncate: %v", err)
		}
		_ = s.Close()
	})
	if _, err := s.db.Exec(`TRUNCATE profiles`); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return s
}

func newProfile(id, alias string) *Profile {
	return &Profile{
		ID:     id,
		Alias:  alias,
		Type:   "poster",
		Config: json.RawMessage(`{"style":"pill"}`),
	}
}

func TestPostgresRoundTrip(t *testing.T) {
	s := postgresStore(t)

	p := newProfile("abc123", "myalias")
	if err := s.Save(p); err != nil {
		t.Fatalf("save: %v", err)
	}

	got, err := s.Get("abc123")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.Alias != "myalias" || got.Type != "poster" {
		t.Fatalf("round-tripped the wrong row: %+v", got)
	}

	// Resolve is the path an artwork URL takes, by alias rather than by id.
	byAlias, err := s.Resolve("myalias")
	if err != nil {
		t.Fatalf("resolve by alias: %v", err)
	}
	if byAlias.ID != "abc123" {
		t.Fatalf("alias resolved to %q", byAlias.ID)
	}

	list, err := s.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected one profile, got %d", len(list))
	}
}

func TestPostgresIDConflictIsErrConflict(t *testing.T) {
	s := postgresStore(t)
	if err := s.Save(newProfile("dup", "")); err != nil {
		t.Fatalf("first save: %v", err)
	}
	err := s.Save(newProfile("dup", ""))
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("expected ErrConflict, got %v", err)
	}
}

func TestPostgresAliasConflictIsErrAliasTaken(t *testing.T) {
	s := postgresStore(t)
	if err := s.Save(newProfile("one", "taken")); err != nil {
		t.Fatalf("first save: %v", err)
	}
	// A different id with the same alias must report the alias, not the id:
	// postgres' message matches the generic unique-violation phrase too, so
	// this asserts the order the two checks run in.
	err := s.Save(newProfile("two", "taken"))
	if !errors.Is(err, ErrAliasTaken) {
		t.Fatalf("expected ErrAliasTaken, got %v", err)
	}
}

func TestPostgresEmptyAliasesDoNotCollide(t *testing.T) {
	s := postgresStore(t)
	// The partial index exempts the empty alias; without WHERE alias <> '' the
	// second of these would fail.
	if err := s.Save(newProfile("a", "")); err != nil {
		t.Fatalf("first: %v", err)
	}
	if err := s.Save(newProfile("b", "")); err != nil {
		t.Fatalf("second unaliased profile was rejected: %v", err)
	}
}

func TestPostgresUpdateDeleteAndPassword(t *testing.T) {
	s := postgresStore(t)
	p := newProfile("edit", "editable")
	if err := s.Save(p); err != nil {
		t.Fatalf("save: %v", err)
	}

	p.Name = "renamed"
	if err := s.Update(p); err != nil {
		t.Fatalf("update: %v", err)
	}
	got, err := s.Get("edit")
	if err != nil || got.Name != "renamed" {
		t.Fatalf("update did not stick: %+v (%v)", got, err)
	}

	if err := s.SetPassword("edit", "hunter2"); err != nil {
		t.Fatalf("set password: %v", err)
	}
	if err := s.CheckPassword("edit", "hunter2"); err != nil {
		t.Fatalf("check password: %v", err)
	}
	if err := s.CheckPassword("edit", "wrong"); !errors.Is(err, ErrWrongPassword) {
		t.Fatalf("expected ErrWrongPassword, got %v", err)
	}

	if err := s.Delete("edit"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.Get("edit"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound after delete, got %v", err)
	}
	if err := s.Delete("edit"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("second delete should report ErrNotFound, got %v", err)
	}
}

func TestPostgresSchemaIsIdempotent(t *testing.T) {
	s := postgresStore(t)
	// Every replica applies the schema on boot; the second one must be a no-op
	// rather than an error.
	if err := applySchemaPostgres(s.db); err != nil {
		t.Fatalf("re-applying the schema failed: %v", err)
	}
}

func TestPostgresConcurrentSchemaApplication(t *testing.T) {
	s := postgresStore(t)

	// Three replicas roll at once and every one of them applies the schema on
	// boot. CREATE ... IF NOT EXISTS is not itself safe against a concurrent
	// identical create, so this is what the advisory lock is for.
	//
	// It is NOT a regression test for the connection-pinning in
	// applySchemaPostgres. That bug -- taking the advisory lock on one pooled
	// connection and releasing it on another, stranding it on an idle session
	// -- was checked against this test with the fix reverted, and the test
	// still passed: database/sql handed the same connection back both times.
	// Reproducing it reliably means controlling which connection the pool
	// returns, which the test cannot do from out here. The deadline below
	// would catch a stranded lock if the pool ever did hand out a different
	// one, so it is worth having, but do not read a pass as proof the pinning
	// is still correct. That rests on the comment in applySchemaPostgres.
	const replicas = 3
	errs := make(chan error, replicas)
	for i := 0; i < replicas; i++ {
		go func() { errs <- applySchemaPostgres(s.db) }()
	}
	deadline := time.After(30 * time.Second)
	for i := 0; i < replicas; i++ {
		select {
		case err := <-errs:
			if err != nil {
				t.Fatalf("concurrent schema application failed: %v", err)
			}
		case <-deadline:
			t.Fatal("timed out: a schema lock was taken and never released")
		}
	}

	// The lock must be free afterwards, not stranded on a pooled connection.
	var held bool
	if err := s.db.QueryRow(
		`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory')`,
	).Scan(&held); err != nil {
		t.Fatalf("inspect advisory locks: %v", err)
	}
	if held {
		t.Error("an advisory lock is still held after every caller returned")
	}
}

func TestRebind(t *testing.T) {
	cases := []struct{ in, want string }{
		{`SELECT 1`, `SELECT 1`},
		{`WHERE id = ?`, `WHERE id = $1`},
		{`VALUES (?, ?, ?)`, `VALUES ($1, $2, $3)`},
		{`WHERE alias <> '' AND id = ?`, `WHERE alias <> '' AND id = $1`},
		// A ? inside a literal is text, not a placeholder.
		{`SET name = 'what?' WHERE id = ?`, `SET name = 'what?' WHERE id = $1`},
		{`SET name = 'it''s?' WHERE id = ?`, `SET name = 'it''s?' WHERE id = $1`},
		{`SELECT "col?" WHERE id = ?`, `SELECT "col?" WHERE id = $1`},
	}
	for _, c := range cases {
		if got := rebind(c.in); got != c.want {
			t.Errorf("rebind(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
