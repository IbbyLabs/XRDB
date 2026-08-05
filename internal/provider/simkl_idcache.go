package provider

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"time"
)

// SIMKL's search endpoint is not cached upstream, so every id lookup is real
// work for them and it is the searches they object to, not the rating fetches.
// An IMDb id's SIMKL id never changes, so a resolved mapping is good forever:
// holding it only for the life of the process meant every release re-searched
// the whole catalogue from cold, and a rating fetch costs two calls rather than
// one until the map refills.
const (
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

// SetIDCachePath points the id cache at a file and loads what is already there.
func (s *SIMKL) SetIDCachePath(dir string, logger *slog.Logger) {
	if s == nil || dir == "" {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	s.mu.Lock()
	s.idCachePath = filepath.Join(dir, simklIDCacheFile)
	path := s.idCachePath
	s.mu.Unlock()

	data, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			logger.Warn("Could not read the remembered SIMKL ids; they will be resolved again",
				"path", path, "error", err)
		}
		return
	}
	var snap simklIDSnapshot
	if err := json.Unmarshal(data, &snap); err != nil {
		logger.Warn("Could not parse the remembered SIMKL ids; they will be resolved again",
			"path", path, "error", err)
		return
	}
	if snap.Shape != simklIDCacheShape {
		logger.Info("Discarded remembered SIMKL ids from an older shape",
			"stored_shape", snap.Shape, "current_shape", simklIDCacheShape)
		return
	}

	now := s.now()
	s.mu.Lock()
	if s.idCache == nil {
		s.idCache = make(map[string]string, len(snap.IDs))
	}
	for imdbID, simklID := range snap.IDs {
		if imdbID == "" || simklID == "" {
			continue
		}
		s.idCache[imdbID] = simklID
	}
	if s.idMisses == nil {
		s.idMisses = make(map[string]time.Time, len(snap.Misses))
	}
	expired := 0
	for imdbID, at := range snap.Misses {
		if imdbID == "" {
			continue
		}
		if now.Sub(at) >= simklIDMissTTL {
			expired++
			continue
		}
		s.idMisses[imdbID] = at
	}
	held, misses := len(s.idCache), len(s.idMisses)
	s.mu.Unlock()

	logger.Info("Restored remembered SIMKL ids from disk",
		"ids", held, "misses", misses, "expired_misses", expired, "path", path)
}

// SaveIDCache writes the resolved mappings so a restart does not search for
// them again. Written through a temporary file so a kill mid-write cannot leave
// a corrupt snapshot behind.
func (s *SIMKL) SaveIDCache() error {
	if s == nil {
		return nil
	}
	now := s.now()
	s.mu.RLock()
	path := s.idCachePath
	ids := make(map[string]string, len(s.idCache))
	for k, v := range s.idCache {
		ids[k] = v
	}
	misses := make(map[string]time.Time, len(s.idMisses))
	for k, at := range s.idMisses {
		if now.Sub(at) < simklIDMissTTL {
			misses[k] = at
		}
	}
	s.mu.RUnlock()
	if path == "" {
		return nil
	}

	data, err := json.Marshal(simklIDSnapshot{Shape: simklIDCacheShape, IDs: ids, Misses: misses})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
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
	ids, misses := len(s.idCache), len(s.idMisses)
	s.mu.RUnlock()
	return SIMKLIDCacheStats{
		IDs: ids, Misses: misses,
		Hits: s.idHits.Load(), NoMatch: s.idNoMatch.Load(), Searches: s.idSearches.Load(),
	}
}
