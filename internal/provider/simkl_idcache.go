package provider

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

// An id lookup is uncached upstream and costs a request of its own, so a rating
// fetch is two calls rather than one until the id is known. The mapping never
// changes, so a resolved one is good forever; holding it only for the life of
// the process meant every restart re-searched the catalogue from cold.
const (
	// simklIDCacheFile is the JSON store this replaced. Still read once, to
	// migrate whatever an older release left behind.
	simklIDCacheFile = "simkl-ids.json"
	// simklIDCacheShape guards against reading a file written in an older layout.
	simklIDCacheShape = 1
)

type simklIDSnapshot struct {
	Shape int               `json:"shape"`
	IDs   map[string]string `json:"ids"`
	// Misses carries titles SIMKL has no entry for, with the time each was
	// recorded. They expire; the ids do not.
	Misses map[string]time.Time `json:"misses,omitempty"`
}

// SetIDCachePath opens the id store and migrates any JSON file left by an
// earlier release.
func (s *SIMKL) SetIDCachePath(dir string, logger *slog.Logger) {
	if s == nil || dir == "" {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		logger.Warn("Could not create the cache directory; SIMKL ids will be resolved every run",
			"dir", dir, "error", err)
		return
	}

	store, err := openSIMKLIDStore(filepath.Join(dir, simklIDStoreFile))
	if err != nil {
		logger.Warn("Could not open the SIMKL id store; ids will be resolved every run",
			"error", err)
		return
	}
	s.mu.Lock()
	old := s.store
	s.store, s.idCachePath = store, dir
	s.mu.Unlock()
	_ = old.Close()

	s.migrateJSON(dir, logger)
	store.pruneMisses(s.now())

	ids, misses := store.counts()
	logger.Info("Opened the SIMKL id store", "ids", ids, "misses", misses,
		"path", filepath.Join(dir, simklIDStoreFile))
}

// migrateJSON imports the file the JSON version wrote and renames it, so
// nothing is lost and the old path does not linger.
func (s *SIMKL) migrateJSON(dir string, logger *slog.Logger) {
	path := filepath.Join(dir, simklIDCacheFile)
	data, err := os.ReadFile(path)
	if err != nil {
		return // absent is the normal case after the first run
	}
	var snap simklIDSnapshot
	if err := json.Unmarshal(data, &snap); err != nil || snap.Shape != simklIDCacheShape {
		logger.Warn("Could not read the old SIMKL id file to migrate it",
			"path", path, "stored_shape", snap.Shape, "error", err)
		return
	}
	if err := s.store.importMap(snap.IDs, snap.Misses); err != nil {
		logger.Warn("Could not migrate the old SIMKL id file; leaving it in place",
			"path", path, "error", err)
		return
	}
	if err := os.Rename(path, path+".migrated"); err != nil {
		logger.Warn("Migrated the SIMKL ids but could not rename the old file",
			"path", path, "error", err)
	}
	logger.Info("Migrated the SIMKL ids out of JSON",
		"ids", len(snap.IDs), "misses", len(snap.Misses))
}

// SaveIDCache is retained for the snapshot loop. Every write already committed
// when it happened, so this only ages out expired misses.
func (s *SIMKL) SaveIDCache() error {
	if s == nil {
		return nil
	}
	s.mu.RLock()
	store := s.store
	s.mu.RUnlock()
	store.pruneMisses(s.now())
	return nil
}

// SIMKLIDCacheStats describes how much searching the cache is sparing SIMKL.
type SIMKLIDCacheStats struct {
	IDs      int
	Misses   int
	Hits     int64
	NoMatch  int64
	Searches int64
}

// IDCacheStats reports how many id lookups were answered without a search, so
// the saving is observable rather than assumed.
func (s *SIMKL) IDCacheStats() SIMKLIDCacheStats {
	if s == nil {
		return SIMKLIDCacheStats{}
	}
	s.mu.RLock()
	store := s.store
	s.mu.RUnlock()
	ids, misses := store.counts()
	return SIMKLIDCacheStats{
		IDs: ids, Misses: misses,
		Hits: s.idHits.Load(), NoMatch: s.idNoMatch.Load(), Searches: s.idSearches.Load(),
	}
}
