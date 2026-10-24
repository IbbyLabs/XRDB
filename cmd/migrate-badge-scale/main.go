// Command migrate-badge-scale lowers saved ratingBadgeScale values so a profile
// renders the same badge size under the scale-aware frame caps as it did under
// the fixed ones.
package main

import (
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"

	_ "modernc.org/sqlite"

	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

const flatSurface = "all"

type change struct {
	ProfileID string `json:"profileId"`
	Surface   string `json:"surface"`
	OldValue  int    `json:"oldValue"`
	NewValue  int    `json:"newValue"`
}

func main() {
	dbPath := flag.String("db", "", "path to the SQLite database")
	dryRun := flag.Bool("dry-run", false, "report the changes without writing")
	apply := flag.Bool("apply", false, "write the changes (requires --backup)")
	backup := flag.String("backup", "", "file to write the change list to before applying")
	restore := flag.String("restore", "", "backup file to undo")
	flag.Parse()

	if *dbPath == "" {
		fail("--db is required")
	}
	modes := 0
	for _, on := range []bool{*dryRun, *apply, *restore != ""} {
		if on {
			modes++
		}
	}
	if modes != 1 {
		fail("choose exactly one of --dry-run, --apply, --restore <file>")
	}
	if *apply && *backup == "" {
		fail("--apply requires --backup <file>")
	}

	db, err := sql.Open("sqlite", *dbPath)
	if err != nil {
		fail("open database: %v", err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			fmt.Fprintf(os.Stderr, "close database: %v\n", err)
		}
	}()

	if *restore != "" {
		if err := runRestore(db, *restore); err != nil {
			fail("restore: %v", err)
		}
		return
	}

	changes, err := plan(db)
	if err != nil {
		fail("plan: %v", err)
	}
	report(changes)
	if *dryRun {
		return
	}
	if err := writeBackup(*backup, changes); err != nil {
		fail("write backup: %v", err)
	}
	if err := applyChanges(db, changes, func(c change) int { return c.NewValue }); err != nil {
		fail("apply: %v", err)
	}
	fmt.Printf("applied %d changes; backup at %s\n", len(changes), *backup)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func plan(db *sql.DB) ([]change, error) {
	rows, err := db.Query(`SELECT id, config FROM profiles ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []change
	for rows.Next() {
		var id, config string
		if err := rows.Scan(&id, &config); err != nil {
			return nil, err
		}
		out = append(out, planProfile(id, json.RawMessage(config))...)
	}
	return out, rows.Err()
}

func planProfile(id string, config json.RawMessage) []change {
	var env struct {
		Surfaces map[string]json.RawMessage `json:"surfaces"`
	}
	_ = json.Unmarshal(config, &env)
	var out []change
	if len(env.Surfaces) == 0 {
		// A flat config applies to every surface; the lowest result keeps both from growing.
		cfg := imageconfig.Parse(config)
		if cfg.RatingBadgeScale <= 100 {
			return nil
		}
		next := cfg.RatingBadgeScale
		for _, mt := range []string{"poster", "backdrop"} {
			if v := newScale(mt, cfg); v < next {
				next = v
			}
		}
		if next < cfg.RatingBadgeScale {
			out = append(out, change{id, flatSurface, cfg.RatingBadgeScale, next})
		}
		return out
	}
	for _, mt := range []string{"poster", "backdrop"} {
		sub, ok := env.Surfaces[mt]
		if !ok {
			continue
		}
		cfg := imageconfig.Parse(sub)
		if cfg.RatingBadgeScale <= 100 {
			continue
		}
		if next := newScale(mt, cfg); next < cfg.RatingBadgeScale {
			out = append(out, change{id, mt, cfg.RatingBadgeScale, next})
		}
	}
	return out
}

// newScale is the equivalent percent for a typical row: the config's main
// ratings list with ordinary values.
func newScale(mediaType string, cfg imageconfig.Config) int {
	for _, sources := range [][]string{cfg.Ratings, cfg.RatingsMovie, cfg.RatingsSeries, cfg.RatingsAnime} {
		if len(sources) == 0 {
			continue
		}
		if v := compose.LegacyEquivalentBadgeScale(mediaType, cfg, sampleRatings(sources)); v < cfg.RatingBadgeScale {
			return max(v, 100)
		}
		break
	}
	return cfg.RatingBadgeScale
}

func sampleRatings(sources []string) []provider.Rating {
	out := make([]provider.Rating, 0, len(sources))
	for _, s := range sources {
		out = append(out, provider.Rating{Source: s, Value: 7.8, Label: "7.8"})
	}
	return out
}

func report(changes []change) {
	hist := map[string]int{}
	profiles := map[string]struct{}{}
	for _, c := range changes {
		profiles[c.ProfileID] = struct{}{}
		hist[fmt.Sprintf("%d -> %d", c.OldValue, c.NewValue)]++
	}
	keys := make([]string, 0, len(hist))
	for k := range hist {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if hist[keys[i]] != hist[keys[j]] {
			return hist[keys[i]] > hist[keys[j]]
		}
		return keys[i] < keys[j]
	})
	fmt.Printf("%d surface values change across %d profiles\n", len(changes), len(profiles))
	for _, k := range keys {
		fmt.Printf("  %-12s %d\n", k, hist[k])
	}
}

func writeBackup(path string, changes []change) error {
	data, err := json.MarshalIndent(changes, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

func runRestore(db *sql.DB, path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var changes []change
	if err := json.Unmarshal(data, &changes); err != nil {
		return err
	}
	if err := applyChanges(db, changes, func(c change) int { return c.OldValue }); err != nil {
		return err
	}
	fmt.Printf("restored %d values\n", len(changes))
	return nil
}

func applyChanges(db *sql.DB, changes []change, value func(change) int) error {
	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, c := range changes {
		var config string
		if err := tx.QueryRow(`SELECT config FROM profiles WHERE id = ?`, c.ProfileID).Scan(&config); err != nil {
			return fmt.Errorf("profile %s: %w", c.ProfileID, err)
		}
		next, err := setScale(json.RawMessage(config), c.Surface, value(c))
		if err != nil {
			return fmt.Errorf("profile %s: %w", c.ProfileID, err)
		}
		if _, err := tx.Exec(`UPDATE profiles SET config = ? WHERE id = ?`, string(next), c.ProfileID); err != nil {
			return fmt.Errorf("profile %s: %w", c.ProfileID, err)
		}
	}
	return tx.Commit()
}

func setScale(config json.RawMessage, surface string, v int) (json.RawMessage, error) {
	num := json.RawMessage(fmt.Sprint(v))
	var top map[string]json.RawMessage
	if err := json.Unmarshal(config, &top); err != nil {
		return nil, err
	}
	if surface == flatSurface {
		top["ratingBadgeScale"] = num
		return json.Marshal(top)
	}
	var surfaces map[string]json.RawMessage
	if err := json.Unmarshal(top["surfaces"], &surfaces); err != nil {
		return nil, err
	}
	var sub map[string]json.RawMessage
	if err := json.Unmarshal(surfaces[surface], &sub); err != nil {
		return nil, err
	}
	sub["ratingBadgeScale"] = num
	var err error
	if surfaces[surface], err = json.Marshal(sub); err != nil {
		return nil, err
	}
	if top["surfaces"], err = json.Marshal(surfaces); err != nil {
		return nil, err
	}
	return json.Marshal(top)
}
