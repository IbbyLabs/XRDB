package animemap

// episodeRow is one MAL entry filed under a TMDB season of a series.
type episodeRow struct {
	malID      int
	tmdbSeason int
	offset     int
	hasOffset  bool
}

// EpisodeEntry is the MAL entry holding a TMDB episode and the episode's number
// inside that entry.
type EpisodeEntry struct {
	MALID   int
	Episode int
	// Offset is where the entry starts inside the TMDB season: its first
	// episode is TMDB episode Offset+1.
	Offset int
	// Prev is the entry before it in the same season, the one with the next
	// lower offset. HasPrev is false for the first entry.
	HasPrev    bool
	PrevMALID  int
	PrevOffset int
}

// EpisodeRefusal names why a TMDB episode did not map onto a MAL entry.
type EpisodeRefusal string

const (
	EpisodeResolved EpisodeRefusal = ""
	// EpisodeNoRows is a series with no MAL entry carrying a TMDB season.
	EpisodeNoRows EpisodeRefusal = "no_rows"
	// EpisodeSpecials is season 0 or below, where MAL numbering does not line up.
	EpisodeSpecials EpisodeRefusal = "specials_season"
	// EpisodeNoSeasonRows is a series with no MAL entry in the season asked for.
	EpisodeNoSeasonRows EpisodeRefusal = "no_entry_in_season"
	// EpisodeAmbiguous is a season whose entries cannot be told apart by offset.
	EpisodeAmbiguous EpisodeRefusal = "ambiguous_offsets"
	// EpisodeBeforeFirst is an episode that sits before the first entry's start.
	EpisodeBeforeFirst EpisodeRefusal = "episode_before_first_entry"
)

// episodeRowsFor returns the MAL entries recorded for a series.
func (s *source) episodeRowsFor(key string) []episodeRow {
	s.ensureLoaded()
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.episodeRs[key]
}

// EpisodeEntry maps a TMDB season and episode of a series onto the MAL entry
// that holds it. seriesKey is an IMDb id or "tv:<tmdb id>".
//
// The entry is the one with the largest offset not past the episode, a missing
// offset counting as zero. A season is refused when two entries would share an
// offset or more than one carries none, since which of them starts first is then
// a guess. Whether the resulting episode exists in the entry is for the caller
// to check against the entry's episode list.
func (m *Mapper) EpisodeEntry(seriesKey string, season, episode int) (EpisodeEntry, EpisodeRefusal) {
	if season < 1 {
		return EpisodeEntry{}, EpisodeSpecials
	}
	if seriesKey == "" || episode < 1 {
		return EpisodeEntry{}, EpisodeNoRows
	}
	for _, src := range []*source{m.primary, m.supplement} {
		if src == nil {
			continue
		}
		if rows := src.episodeRowsFor(seriesKey); len(rows) > 0 {
			return mapEpisode(rows, season, episode)
		}
	}
	return EpisodeEntry{}, EpisodeNoRows
}

func mapEpisode(rows []episodeRow, season, episode int) (EpisodeEntry, EpisodeRefusal) {
	var inSeason []episodeRow
	for _, r := range rows {
		if r.tmdbSeason == season {
			inSeason = append(inSeason, r)
		}
	}
	if len(inSeason) == 0 {
		return EpisodeEntry{}, EpisodeNoSeasonRows
	}
	missing := 0
	seen := make(map[int]bool, len(inSeason))
	for _, r := range inSeason {
		if !r.hasOffset {
			missing++
		}
		if seen[r.offset] {
			return EpisodeEntry{}, EpisodeAmbiguous
		}
		seen[r.offset] = true
	}
	if missing > 1 {
		return EpisodeEntry{}, EpisodeAmbiguous
	}
	best := -1
	for i, r := range inSeason {
		if r.offset <= episode-1 && (best < 0 || r.offset > inSeason[best].offset) {
			best = i
		}
	}
	if best < 0 {
		return EpisodeEntry{}, EpisodeBeforeFirst
	}
	chosen := inSeason[best]
	out := EpisodeEntry{MALID: chosen.malID, Episode: episode - chosen.offset, Offset: chosen.offset}
	for _, r := range inSeason {
		if r.offset < chosen.offset && (!out.HasPrev || r.offset > out.PrevOffset) {
			out.HasPrev, out.PrevMALID, out.PrevOffset = true, r.malID, r.offset
		}
	}
	return out, EpisodeResolved
}

// MALIDFor returns the MAL id of an anime-service id, from the dataset row that
// carries both.
func (m *Mapper) MALIDFor(animeID string) (int, bool) {
	service, num, ok := ParseAnimeID(animeID)
	if !ok {
		return 0, false
	}
	if service == "mal" {
		return num, true
	}
	key := animeKey(service, num)
	for _, src := range []*source{m.primary, m.supplement} {
		if src == nil {
			continue
		}
		if mal := src.malFor(key); mal != 0 {
			return mal, true
		}
	}
	return 0, false
}

func (s *source) malFor(key string) int {
	s.ensureLoaded()
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.byAnimeID[key].MAL
}
