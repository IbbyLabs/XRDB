package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"xrdb_rewrite/internal/logging"
)

const tmdbBaseURL = "https://api.themoviedb.org/3"
const tmdbImageBase = "https://image.tmdb.org/t/p"

// TMDB is the TMDB metadata provider.
type TMDB struct {
	mu         sync.RWMutex
	apiKey     string
	readToken  string
	httpClient *http.Client
	// baseURL overrides the public API root for tests. Empty means tmdbBaseURL.
	baseURL string
	kinds   *tmdbKindStore
	// substitutions counts country substitutions per requested->delivered pair.
	// Keyed on the pair rather than globally: a rare fallback is the one someone
	// reports, and a single counter would swallow its first occurrence behind a
	// common one.
	substitutions sync.Map
}

// tmdbStatusError carries the status of a refused request, so a caller can tell
// a record TMDB does not hold from one it declined to serve.
type tmdbStatusError struct {
	Code int
	Path string
}

func (e *tmdbStatusError) Error() string {
	return fmt.Sprintf("tmdb http %d for %s", e.Code, e.Path)
}

func (t *TMDB) log() *slog.Logger { return slog.Default() }

// base returns the API root for this client.
func (t *TMDB) base() string {
	if t.baseURL != "" {
		return t.baseURL
	}
	return tmdbBaseURL
}

// NewTMDBAt is NewTMDB with the API root replaced. For tests; production wires
// NewTMDB.
func NewTMDBAt(apiKey, readToken, baseURL string) *TMDB {
	t := NewTMDB(apiKey, readToken)
	t.baseURL = baseURL
	return t
}

// NewTMDB creates a TMDB provider. Provide either apiKey or readToken (readToken preferred).
func NewTMDB(apiKey, readToken string) *TMDB {
	return &TMDB{
		apiKey:     apiKey,
		readToken:  readToken,
		httpClient: newHTTPClient("tmdb", 10*time.Second),
	}
}

// SetHTTPClient replaces the transport used for TMDB requests.
func (t *TMDB) SetHTTPClient(client *http.Client) {
	if client == nil {
		return
	}
	t.httpClient = client
}

// UpdateCredentials swaps the live TMDB credentials without replacing the
// provider, so UI-saved keys take effect immediately.
func (t *TMDB) UpdateCredentials(apiKey, readToken string) {
	t.mu.Lock()
	t.apiKey = apiKey
	t.readToken = readToken
	t.mu.Unlock()
}

func (t *TMDB) credentials(ctx context.Context) (apiKey, readToken string) {
	// An owner-supplied credential stands in for the server's for this render.
	// TMDB issues two kinds and the endpoints differ, so which slot it fills is
	// read off the value: a v4 read token is a JWT, a v3 key is a plain hex id.
	if k := keyFrom(ctx, KeyTMDB); k != "" {
		if IsTMDBReadToken(k) {
			return "", k
		}
		return k, ""
	}
	t.mu.RLock()
	defer t.mu.RUnlock()
	return t.apiKey, t.readToken
}

// HasCredentials reports whether the provider can make authenticated TMDB requests.
func (t *TMDB) HasCredentials() bool {
	apiKey, readToken := t.credentials(context.Background())
	return apiKey != "" || readToken != ""
}

func (t *TMDB) Name() string { return "tmdb" }

// RatingSources lists the rating this provider can supply, so a render that
// selected none of them skips the call.
func (t *TMDB) RatingSources() []string { return []string{"tmdb"} }

// Fetch retrieves TMDB metadata for a media item.
// mediaType must be "movie" or "tv"; id must be a numeric TMDB ID or an IMDb tt-ID.
func (t *TMDB) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	return t.FetchArtwork(ctx, mediaType, id, ArtworkOptions{})
}

// FetchArtwork retrieves TMDB metadata honoring artwork language, text
// preference, and size options when selecting poster/backdrop/logo variants.
func (t *TMDB) FetchArtwork(ctx context.Context, mediaType, id string, opts ArtworkOptions) (*MediaMeta, error) {
	apiKey, readToken := t.credentials(ctx)
	if apiKey == "" && readToken == "" {
		return nil, fmt.Errorf("tmdb: no api key or read token configured")
	}
	// resolve IMDb ID → TMDB ID if needed
	tmdbID, resolvedType, guessed, stated, err := t.resolveID(ctx, mediaType, id)
	if err != nil {
		return nil, fmt.Errorf("tmdb: resolve id %q: %w", id, err)
	}
	// A bare number can hold a record under both kinds, so the default above is
	// a guess. The store settles which one it names. guessed stays true, so the
	// retry below still corrects a record that holds no image.
	if !stated && isNumericID(tmdbID) {
		if kind, kindErr := t.KindOfTMDBID(ctx, tmdbID); kindErr == nil {
			if kind == "series" {
				resolvedType = "tv"
			} else {
				resolvedType = "movie"
			}
		} else {
			t.log().DebugContext(ctx, "Could not settle the kind of a bare TMDB id, falling back to the guess",
				"tmdb_id", tmdbID, "error", kindErr)
		}
	}

	meta, err := t.fetchByTMDBID(ctx, resolvedType, tmdbID, opts)
	if !guessed {
		return meta, err
	}
	// /movie and /tv number independently, so one id can hold a record under
	// both with artwork under only one. A record carrying no artwork leaves the
	// kind as unsettled as a 404 does.
	answeredEmpty := err == nil && !metaHasArtwork(meta)
	if err == nil && !answeredEmpty {
		return meta, err
	}
	if err != nil {
		var status *tmdbStatusError
		if !errors.As(err, &status) || status.Code != http.StatusNotFound {
			return meta, err
		}
	}
	other := otherContentType(resolvedType)
	retried, retryErr := t.fetchByTMDBID(ctx, other, tmdbID, opts)
	if retryErr != nil {
		return meta, err
	}
	if answeredEmpty && !metaHasArtwork(retried) {
		return meta, err
	}
	t.log().InfoContext(ctx, "A TMDB id with no kind resolved to the other one",
		"id", id, "guessed", resolvedType, "resolved", other)
	return retried, nil
}

// The fourth result reports whether a kind was stated, by the caller or by a
// token in the id. Nothing stated is not the same as "movie".
func (t *TMDB) resolveID(ctx context.Context, mediaType, id string) (string, string, bool, bool, error) {
	id = strings.TrimSpace(id)

	// The scheme and content-type token come off first. An id can carry an
	// external id after the token ("series:tt0903747"), and testing for one
	// before stripping left it to be read as a TMDB number.
	// The scheme and the content-type token arrive in either order —
	// "tmdb:series:1396" from one caller, "series:tmdb:1396" from another — so
	// both are stripped until neither is left. Taking them in a fixed order left
	// whichever came second embedded in the id, which then 404s as a literal.
	rest := id
	for {
		if r, ok := stripPrefix(rest, "tmdb:"); ok {
			rest = r
			continue
		}
		matched := false
		for _, tok := range []string{"movie:", "series:", "tv:"} {
			if r, ok := stripPrefix(rest, tok); ok {
				mediaType = strings.TrimSuffix(tok, ":")
				rest = r
				matched = true
				break
			}
		}
		if !matched {
			break
		}
	}

	// IMDB tt-IDs need the find endpoint to get a TMDB ID.
	if strings.HasPrefix(rest, "tt") {
		match, found, err := t.findByExternalID(ctx, rest, "imdb_id", preferredBucket(mediaType))
		if err != nil {
			return "", "", false, true, err
		}
		if found {
			return match.ID, match.ContentType, false, true, nil
		}
		return "", "", false, true, fmt.Errorf("no TMDB match for IMDB id %q", id)
	}

	// TVDB IDs (emitted by AIOMetadata's imdb-less art fallback, e.g.
	// "tvdb:81189") resolve via TMDB's find endpoint keyed on the TVDB source.
	if r, ok := stripPrefix(rest, "tvdb:"); ok {
		match, found, err := t.findByExternalID(ctx, r, "tvdb_id", preferredBucket(mediaType))
		if err != nil {
			return "", "", false, true, err
		}
		if found {
			return match.ID, match.ContentType, false, true, nil
		}
		return "", "", false, true, fmt.Errorf("no TMDB match for TVDB id %q", id)
	}

	// What remains is a native TMDB id, bare ("1396") or from the composite
	// forms AIOMetadata emits when it has no IMDb id for a title.

	// Normalize media type. Only movie/series are meaningful here; artwork
	// surface names (poster/backdrop/logo) are not content-type hints — so a
	// bare "tmdb:1399" arrives with nothing saying which it is and becomes a
	// movie. That guess is right for films and 404s for every series, which is
	// why the caller is told it was a guess and can try the other one.
	resolvedType := "movie"
	guessed := true
	if isSeriesType(mediaType) {
		resolvedType = "tv"
		guessed = false
	}
	stated := isSeriesType(mediaType) || isMovieType(mediaType)
	return rest, resolvedType, guessed, stated, nil
}

// metaHasArtwork reports whether an answer carries any image to draw.
func metaHasArtwork(m *MediaMeta) bool {
	return m != nil && (m.PosterURL != "" || m.BackdropURL != "" || m.LogoURL != "")
}

// otherContentType is the kind a guess did not take.
func otherContentType(kind string) string {
	if kind == "tv" {
		return "movie"
	}
	return "tv"
}

// externalMatch is what TMDB's /find endpoint says an external id names.
type externalMatch struct {
	ID          string
	ContentType string // "movie" | "tv"
	Title       string
	// Popularity is TMDB's own relevance score, used only to break a tie
	// between two records claiming the same external id.
	Popularity float64
	// Season and Episode address one episode of the series ID names. IsEpisode
	// says the id named an episode rather than that the numbers are non-zero:
	// TMDB numbers a special as season 0, so zero is a value here.
	Season    int
	Episode   int
	IsEpisode bool
}

// IdentifyEpisode reports which episode an external id names, if it names one.
//
// The same /find response that resolves a tt-id to a TMDB id already carries
// the season and episode, so this costs the request the caller was going to
// make rather than an extra one — provided the caller then addresses the series
// numerically and does not send the tt-id round again.
func (t *TMDB) IdentifyEpisode(ctx context.Context, id string) (string, int, int, bool, error) {
	rest := strings.TrimSpace(id)
	if !strings.HasPrefix(rest, "tt") {
		return "", 0, 0, false, nil
	}
	match, found, err := t.findByExternalID(ctx, rest, "imdb_id", "")
	if err != nil || !found || !match.IsEpisode {
		return "", 0, 0, false, err
	}
	return match.ID, match.Season, match.Episode, true, nil
}

// findByExternalID resolves an external identifier (an IMDb tt-id or a TVDB id)
// to a TMDB id via TMDB's /find endpoint. found is false when TMDB returns no
// match; err is non-nil only on a transport/decoding failure.
//
// prefer is "movie", "tv", or "" and decides which record wins when the id is
// attached to both. An IMDb id names one work, so two records mean TMDB holds a
// duplicate and one of them is wrong.
func (t *TMDB) findByExternalID(ctx context.Context, externalID, source, prefer string) (match externalMatch, found bool, err error) {
	path := t.base() + "/find/" + url.PathEscape(externalID) + "?external_source=" + source
	var result struct {
		MovieResults []struct {
			ID         int     `json:"id"`
			Title      string  `json:"title"`
			Popularity float64 `json:"popularity"`
		} `json:"movie_results"`
		TVResults []struct {
			ID         int     `json:"id"`
			Name       string  `json:"name"`
			Popularity float64 `json:"popularity"`
		} `json:"tv_results"`
		// An episode's external id comes back here and in neither list above, so
		// without this field the decode succeeds, both lists are empty, and the
		// id reads as one TMDB has never heard of. The entry names its show, so
		// the episode resolves to the series it belongs to without a second
		// request — which is the only thing every other source can answer about.
		TVEpisodeResults []struct {
			ShowID  int `json:"show_id"`
			Season  int `json:"season_number"`
			Episode int `json:"episode_number"`
		} `json:"tv_episode_results"`
	}
	if err := t.get(ctx, path, &result); err != nil {
		return externalMatch{}, false, err
	}
	var movie, tv *externalMatch
	if len(result.MovieResults) > 0 {
		m := result.MovieResults[0]
		movie = &externalMatch{ID: strconv.Itoa(m.ID), ContentType: "movie", Title: m.Title, Popularity: m.Popularity}
	}
	if len(result.TVResults) > 0 {
		s := result.TVResults[0]
		tv = &externalMatch{ID: strconv.Itoa(s.ID), ContentType: "tv", Title: s.Name, Popularity: s.Popularity}
	}
	// An episode id belongs to its show. Every source XRDB asks indexes shows
	// and none indexes episodes, so this is what turns four simultaneous
	// failures into four answers.
	if movie == nil && tv == nil && len(result.TVEpisodeResults) > 0 {
		if e := result.TVEpisodeResults[0]; e.ShowID > 0 {
			t.log().InfoContext(ctx, "An episode id was resolved to the series it belongs to",
				"id", logging.RequestID(ctx), "external_id", externalID, "series", e.ShowID,
				"season", e.Season, "episode", e.Episode)
			// Season and episode ride along so a caller that wants the episode
			// itself is not left resolving the id a second time. Zero for a
			// series' own special, which TMDB numbers season 0.
			return externalMatch{
				ID: strconv.Itoa(e.ShowID), ContentType: "tv",
				Season: e.Season, Episode: e.Episode, IsEpisode: true,
			}, true, nil
		}
	}
	switch {
	case movie == nil && tv == nil:
		return externalMatch{}, false, nil
	case tv == nil:
		return *movie, true, nil
	case movie == nil:
		return *tv, true, nil
	}
	chosen, why := resolveDuplicate(movie, tv, prefer)
	t.log().WarnContext(ctx, "An external id is attached to two TMDB records; one of them is wrong",
		"id", logging.RequestID(ctx), "external_id", externalID,
		"movie", movie.ID, "movie_title", movie.Title,
		"series", tv.ID, "series_title", tv.Title,
		"chose", chosen.ContentType, "because", why)
	return *chosen, true, nil
}

// resolveDuplicate picks between a movie and a series that claim the same
// external id. A caller that knows the content type settles it outright.
// Otherwise popularity does: a duplicate pairs a real title with a record
// almost nobody looks at.
func resolveDuplicate(movie, tv *externalMatch, prefer string) (*externalMatch, string) {
	switch prefer {
	case "movie":
		return movie, "the caller asked for a movie"
	case "tv":
		return tv, "the caller asked for a series"
	}
	if tv.Popularity > movie.Popularity {
		return tv, "the series is the more popular record"
	}
	return movie, "the movie is the more popular record"
}

// preferredBucket maps a content-type hint onto the /find bucket it belongs to.
// An empty or unrecognised hint expresses no preference.
func preferredBucket(mediaType string) string {
	switch {
	case isSeriesType(mediaType):
		return "tv"
	case isMovieType(mediaType):
		return "movie"
	default:
		return ""
	}
}

// IdentifyID resolves an IMDb tt-id or TVDB id to TMDB's own id and content
// type, so a source matched through a third-party id index can be checked
// against it. contentType is "movie" or "series".
//
// hint is what the caller already knows the title to be, if anything. It settles
// an id TMDB holds against two records, where resolving to the wrong one would
// make every later check agree on the wrong title.
func (t *TMDB) IdentifyID(ctx context.Context, id, hint string) (tmdbID, contentType string, err error) {
	contentTypeHint := hint
	id = strings.TrimSpace(id)
	source := "imdb_id"
	if rest, ok := stripPrefix(id, "tvdb:"); ok {
		id, source = rest, "tvdb_id"
	} else if !strings.HasPrefix(id, "tt") {
		return "", "", fmt.Errorf("tmdb: %q is not an external id", id)
	}
	match, found, err := t.findByExternalID(ctx, id, source, preferredBucket(contentTypeHint))
	if err != nil {
		return "", "", err
	}
	if !found {
		return "", "", fmt.Errorf("tmdb: no match for external id %q: %w", id, errNotFound)
	}
	if match.ContentType == "tv" {
		return match.ID, "series", nil
	}
	return match.ID, "movie", nil
}

// EpisodeInfo holds the per-episode data resolved from TMDB: the episode still
// image, TMDB's own episode rating, and the episode's IMDb tconst (so other
// providers can look up per-episode ratings).
type EpisodeInfo struct {
	Name     string
	StillURL string
	IMDbID   string
	Rating   *Rating
}

// FetchEpisode resolves a single episode of a series. seriesID may be an IMDb
// tt-id or a TMDB numeric id. Returns the episode still, TMDB episode rating,
// and the episode's own IMDb id — the pieces needed for per-episode thumbnails.
func (t *TMDB) FetchEpisode(ctx context.Context, seriesID string, season, episode int, opts ArtworkOptions) (*EpisodeInfo, error) {
	apiKey, readToken := t.credentials(ctx)
	if apiKey == "" && readToken == "" {
		return nil, fmt.Errorf("tmdb: no api key or read token configured")
	}
	tmdbID, _, _, _, err := t.resolveID(ctx, "series", seriesID)
	if err != nil {
		return nil, fmt.Errorf("tmdb: resolve series %q: %w", seriesID, err)
	}
	path := fmt.Sprintf("%s/tv/%s/season/%d/episode/%d?append_to_response=external_ids",
		t.base(), tmdbID, season, episode)
	var result struct {
		Name        string  `json:"name"`
		StillPath   string  `json:"still_path"`
		VoteAverage float64 `json:"vote_average"`
		VoteCount   int     `json:"vote_count"`
		ExternalIDs struct {
			IMDbID string `json:"imdb_id"`
		} `json:"external_ids"`
	}
	if err := t.get(ctx, path, &result); err != nil {
		return nil, err
	}
	info := &EpisodeInfo{Name: result.Name, IMDbID: result.ExternalIDs.IMDbID}
	stillRes := "/w780"
	if opts.Size == "large" || opts.Size == "4k" {
		stillRes = "/original"
	}
	if result.StillPath != "" {
		info.StillURL = tmdbImageBase + stillRes + result.StillPath
	}
	if result.VoteAverage > 0 {
		info.Rating = &Rating{
			Source: "tmdb",
			Value:  result.VoteAverage,
			Votes:  result.VoteCount,
			Label:  fmt.Sprintf("%.1f", result.VoteAverage),
		}
	}
	return info, nil
}

// imageLanguageOf reduces a tag to the base subtag the sources tag images with,
// the same way the config does, so a fallback set as "pt-BR" still matches.
func imageLanguageOf(v string) string {
	v = strings.ToLower(strings.TrimSpace(strings.ReplaceAll(v, "_", "-")))
	base, _, _ := strings.Cut(v, "-")
	if base == "us" {
		return "en"
	}
	return base
}

func (t *TMDB) fetchByTMDBID(ctx context.Context, mediaType, id string, opts ArtworkOptions) (*MediaMeta, error) {
	// The configured language may name a region — "es-MX" — which selects a
	// country's artwork rather than a language. Matching and the API's own
	// filter take the base subtag.
	lang := imageLanguageOf(opts.Language)
	wantOriginal := IsOriginalLanguage(strings.ToLower(strings.TrimSpace(opts.Language)))
	// Pull image variants in the preferred language plus English and
	// language-neutral (textless) art so selection has candidates.
	fallback := imageLanguageOf(opts.FallbackLanguage)
	if fallback == lang {
		fallback = ""
	}
	imgLangs := "en,null"
	if lang != "" && lang != "en" {
		imgLangs = lang + ",en,null"
	}
	// The fallback has to be in the fetch filter or there are no candidates in
	// it to fall back to.
	if fallback != "" && fallback != "en" {
		imgLangs = strings.TrimSuffix(imgLangs, ",en,null") + "," + fallback + ",en,null"
	}
	path := t.base() + "/" + mediaType + "/" + id +
		"?append_to_response=images,release_dates,content_ratings,watch%2Fproviders,external_ids,keywords"
	if wantOriginal {
		// The title's own language is only known once TMDB answers, and there is
		// no wildcard for the filter. Omitting it returns every language.
		lang = ""
	} else {
		path += "&include_image_language=" + imgLangs
	}
	var result struct {
		Title         string `json:"title"`
		Name          string `json:"name"` // TV
		OriginalTitle string `json:"original_title"`
		OriginalName  string `json:"original_name"` // TV
		// OriginalLanguage is the language the title was made in, which is what
		// a request for the original language resolves to.
		OriginalLanguage string `json:"original_language"`
		Overview         string `json:"overview"`
		// Movies carry imdb_id at the top level, series only under external_ids.
		IMDbID      string `json:"imdb_id"`
		ExternalIDs struct {
			IMDbID string `json:"imdb_id"`
		} `json:"external_ids"`
		// Set on the title, not on its images. Only /search accepts
		// include_adult, so a by-id fetch returns a flagged record either way and
		// this field is the only thing that says so.
		Adult        bool    `json:"adult"`
		ReleaseDate  string  `json:"release_date"`
		FirstAirDate string  `json:"first_air_date"`
		VoteAverage  float64 `json:"vote_average"`
		VoteCount    int     `json:"vote_count"`
		PosterPath   string  `json:"poster_path"`
		BackdropPath string  `json:"backdrop_path"`
		Images       struct {
			Posters   []tmdbImage `json:"posters"`
			Backdrops []tmdbImage `json:"backdrops"`
			Logos     []tmdbImage `json:"logos"`
		} `json:"images"`
		Genres []struct {
			Name string `json:"name"`
		} `json:"genres"`
		ReleaseDates struct {
			Results []struct {
				Iso3166 string `json:"iso_3166_1"`
				Dates   []struct {
					Certification string `json:"certification"`
					Type          int    `json:"type"`         // 2,3 = theatrical; 4 = digital; 5 = physical
					ReleaseDate   string `json:"release_date"` // ISO 8601
				} `json:"release_dates"`
			} `json:"results"`
		} `json:"release_dates"`
		ContentRatings struct {
			Results []struct {
				Iso3166 string `json:"iso_3166_1"`
				Rating  string `json:"rating"`
			} `json:"results"`
		} `json:"content_ratings"`
		WatchProviders struct {
			Results map[string]struct {
				Flatrate []struct {
					ProviderID   int    `json:"provider_id"`
					ProviderName string `json:"provider_name"`
					LogoPath     string `json:"logo_path"`
				} `json:"flatrate"`
				Rent []struct {
					ProviderID   int    `json:"provider_id"`
					ProviderName string `json:"provider_name"`
					LogoPath     string `json:"logo_path"`
				} `json:"rent"`
			} `json:"results"`
		} `json:"watch/providers"`
		// Movie keywords live under keywords.keywords; TV under keywords.results.
		// XRDB reads them only to detect the mid/post-credits stinger tags.
		Keywords struct {
			Keywords []struct {
				Name string `json:"name"`
			} `json:"keywords"`
			Results []struct {
				Name string `json:"name"`
			} `json:"results"`
		} `json:"keywords"`
	}
	if err := t.get(ctx, path, &result); err != nil {
		return nil, err
	}

	title := result.Title
	if title == "" {
		title = result.Name
	}
	date := result.ReleaseDate
	if date == "" {
		date = result.FirstAirDate
	}
	year := 0
	if len(date) >= 4 {
		year, _ = strconv.Atoi(date[:4])
	}

	originalTitle := result.OriginalTitle
	if originalTitle == "" {
		originalTitle = result.OriginalName
	}

	imdbID := strings.TrimSpace(result.IMDbID)
	if imdbID == "" {
		imdbID = strings.TrimSpace(result.ExternalIDs.IMDbID)
	}
	if wantOriginal {
		lang = strings.ToLower(strings.TrimSpace(result.OriginalLanguage))
	}
	artLang := lang
	if artLang == "" {
		artLang = "en"
	}
	kwNames := make([]string, 0, len(result.Keywords.Keywords)+len(result.Keywords.Results))
	for _, k := range result.Keywords.Keywords {
		kwNames = append(kwNames, k.Name)
	}
	for _, k := range result.Keywords.Results {
		kwNames = append(kwNames, k.Name)
	}

	meta := &MediaMeta{
		Title:         title,
		OriginalTitle: originalTitle,
		Year:          year,
		Overview:      result.Overview,
		Language:      artLang,
		IMDbID:        imdbID,
		TMDBID:        id,
		Adult:         result.Adult,
		Stinger:       stingerFromKeywords(kwNames),
	}

	// Source resolution: w780/w1280 are plenty for normal output, but large
	// and 4k renders need the original upload to avoid upscaling.
	posterRes, backdropRes := "/w780", "/w1280"
	if opts.Size == "large" || opts.Size == "4k" {
		posterRes, backdropRes = "/original", "/original"
	}

	posterPath := selectImagePath(result.Images.Posters, result.PosterPath, lang, opts)
	if posterPath != "" {
		meta.PosterURL = tmdbImageBase + posterRes + posterPath
		meta.PosterTextless = pathIsTextless(result.Images.Posters, posterPath)
		// Which country's poster the language match landed on. Selection does
		// not consider country, so this says what was delivered rather than
		// what was wanted; the request's own region is stripped before it
		// reaches here.
		country := countryOfPath(result.Images.Posters, posterPath)
		t.log().DebugContext(ctx, "Selected a TMDB poster",
			"media_type", mediaType, "tmdb_id", id,
			"language", lang, "country", country)
		// A region narrows within a language and the language wins, so one
		// country's art can answer a request for another's. artworkRegion rather
		// than releaseRegion, which substitutes "US" when nothing is set.
		want := artworkRegion(opts)
		if want != "" && country != "" && !strings.EqualFold(want, country) {
			if n := t.countSubstitution(want, country); n == 1 || isPowerOfTen(n) {
				t.log().InfoContext(ctx, "No artwork was published for the requested country, so another country's was used",
					"media_type", mediaType, "tmdb_id", id, "language", lang,
					"requested_country", want, "country", country, "total", n)
			}
		}
	}
	backdropPath := selectImagePath(result.Images.Backdrops, result.BackdropPath, lang, opts)
	if backdropPath != "" {
		meta.BackdropURL = tmdbImageBase + backdropRes + backdropPath
		meta.BackdropHasTitle = pathHasLanguage(result.Images.Backdrops, backdropPath)
	}
	// Logos never use the random text/quality filters.
	if logoPath := selectImagePath(result.Images.Logos, "", lang, ArtworkOptions{FallbackLanguage: opts.FallbackLanguage}); logoPath != "" {
		meta.LogoURL = tmdbImageBase + "/w780" + logoPath
	}
	if result.VoteAverage > 0 {
		meta.Ratings = []Rating{{
			Source: "tmdb",
			Value:  result.VoteAverage,
			Votes:  result.VoteCount,
			Label:  fmt.Sprintf("%.1f", result.VoteAverage),
		}}
	}

	// Genres
	if len(result.Genres) > 0 {
		genres := make([]string, 0, len(result.Genres))
		for _, g := range result.Genres {
			if g.Name != "" {
				genres = append(genres, g.Name)
			}
		}
		// Television's "Sci-Fi & Fantasy" is one genre where film has two, so it
		// is narrowed here, before anything downstream buckets or labels it.
		meta.Genres = narrowCompoundGenres(genres, kwNames, id)
	}

	// Release status. Any region counts — a title out on digital somewhere is no
	// longer cinemas-only — so the entries are flattened across regions first.
	{
		var entries []releaseEntry
		for _, r := range result.ReleaseDates.Results {
			for _, d := range r.Dates {
				entries = append(entries, releaseEntry{kind: d.Type, date: d.ReleaseDate})
			}
		}
		meta.ReleaseStatus = resolveReleaseStatus(entries, time.Now())
		// A date is region-scoped where the status is not. A digital date in one
		// country says nothing to a viewer in another, and a wrong date reads as
		// authoritative where a missing badge does not.
		if meta.ReleaseStatus != "digital" {
			var regional []releaseEntry
			for _, r := range result.ReleaseDates.Results {
				if !strings.EqualFold(r.Iso3166, releaseRegion(opts.WatchProvidersCountry)) {
					continue
				}
				for _, d := range r.Dates {
					regional = append(regional, releaseEntry{kind: d.Type, date: d.ReleaseDate})
				}
			}
			// A title in cinemas has one question left, which is when it reaches
			// home. A theatrical date still ahead there is another region's or a
			// re-release and is not that answer.
			kinds := allBadgeReleaseKinds
			if meta.ReleaseStatus == "cinemas" {
				kinds = []int{releaseTypeDigital}
			}
			meta.UpcomingRelease = nextRelease(regional, time.Now(), kinds...)
		}
	}

	// Content rating — prefer US certification
	for _, r := range result.ReleaseDates.Results {
		if r.Iso3166 == "US" {
			for _, d := range r.Dates {
				if d.Certification != "" {
					meta.ContentRating = d.Certification
					break
				}
			}
			break
		}
	}
	// TV content ratings
	if meta.ContentRating == "" {
		for _, r := range result.ContentRatings.Results {
			if r.Iso3166 == "US" && r.Rating != "" {
				meta.ContentRating = r.Rating
				break
			}
		}
	}

	// Watch providers — flatrate first, then rent, for the requested region.
	region := strings.ToUpper(strings.TrimSpace(opts.WatchProvidersCountry))
	if region == "" {
		region = "US"
	}
	if us, ok := result.WatchProviders.Results[region]; ok {
		seen := make(map[int]bool)
		for _, p := range us.Flatrate {
			if !seen[p.ProviderID] && p.ProviderName != "" {
				seen[p.ProviderID] = true
				meta.WatchProviders = append(meta.WatchProviders, WatchProvider{
					ID: p.ProviderID, Name: p.ProviderName, LogoPath: p.LogoPath,
				})
			}
		}
		for _, p := range us.Rent {
			if !seen[p.ProviderID] && p.ProviderName != "" {
				seen[p.ProviderID] = true
				meta.WatchProviders = append(meta.WatchProviders, WatchProvider{
					ID: p.ProviderID, Name: p.ProviderName, LogoPath: p.LogoPath,
				})
			}
		}
	}

	return meta, nil
}

// countSubstitution records one requested->delivered pair and returns how many
// times it has happened since start.
func (t *TMDB) countSubstitution(requested, delivered string) int64 {
	v, _ := t.substitutions.LoadOrStore(requested+"->"+delivered, new(atomic.Int64))
	return v.(*atomic.Int64).Add(1)
}

// artworkRegion is the country whose artwork is preferred. An explicit setting
// wins over a region named in the language: someone who set the country did so
// deliberately, where a language tag's region is often just what a client sends.
func artworkRegion(opts ArtworkOptions) string {
	if c := strings.ToUpper(strings.TrimSpace(opts.WatchProvidersCountry)); c != "" {
		return c
	}
	return languageRegionOf(opts.Language)
}

// languageRegionOf reports the region a language tag names, empty when it names
// none.
func languageRegionOf(v string) string {
	_, region, ok := strings.Cut(strings.TrimSpace(strings.ReplaceAll(v, "_", "-")), "-")
	if !ok {
		return ""
	}
	return strings.ToUpper(region)
}

// countryOfPath reports the country TMDB published one image for, empty when
// the image carries none. Textless art carries neither a language nor a
// country, so an empty answer is the ordinary case rather than a gap.
func countryOfPath(images []tmdbImage, path string) string {
	for _, img := range images {
		if img.FilePath == path && img.Iso3166 != nil {
			return *img.Iso3166
		}
	}
	return ""
}

// tmdbImage is one entry in a TMDB images array.
type tmdbImage struct {
	FilePath string  `json:"file_path"`
	Iso639   *string `json:"iso_639_1"`
	// Iso3166 is the country the artwork was published for. TMDB sets it on
	// every image that carries a language, and four languages commonly span
	// two countries (es ES/MX, pt BR/PT, zh CN/HK/TW, fr CA/FR). Nothing
	// selects on it; it is decoded so a delivered country can be reported.
	Iso3166     *string `json:"iso_3166_1"`
	VoteAverage float64 `json:"vote_average"`
	VoteCount   int     `json:"vote_count"`
	Width       int     `json:"width"`
	Height      int     `json:"height"`
}

// passesQualityFloor reports whether an image clears the configured vote and
// size floors. Zero means no floor, so an unset config admits everything.
func passesQualityFloor(img tmdbImage, opts ArtworkOptions) bool {
	if img.VoteCount < opts.RandomMinVoteCount {
		return false
	}
	if img.VoteAverage < opts.RandomMinVoteAvg {
		return false
	}
	if opts.RandomMinWidth > 0 && img.Width < opts.RandomMinWidth {
		return false
	}
	if opts.RandomMinHeight > 0 && img.Height < opts.RandomMinHeight {
		return false
	}
	return true
}

// selectImagePath picks an image variant according to language and text
// preference. defaultPath is TMDB's canonical pick (poster_path etc.) and is
// the fallback whenever no candidate matches.
//
// Preferences:
//   - "" / "original": language match if requested, else the default
//   - "textless" / "clean": language-neutral art (no baked-in title text)
//   - "alternative": a different variant than the default pick
//   - "random": any candidate, varies between cache refreshes
func selectImagePath(images []tmdbImage, defaultPath, lang string, opts ArtworkOptions) string {
	pref := opts.TextPreference
	if len(images) == 0 {
		return defaultPath
	}

	langOf := func(img tmdbImage) string {
		if img.Iso639 == nil {
			return ""
		}
		return strings.ToLower(*img.Iso639)
	}
	// TMDB serves many logos as SVG, which the raster render pipeline can't
	// decode. Skip them so selection never lands on an undecodable image and
	// falls through to a placeholder.
	isRenderable := func(path string) bool {
		return path != "" && !strings.HasSuffix(strings.ToLower(path), ".svg")
	}
	// bestBy returns the highest-voted image matching the predicate.
	bestBy := func(match func(tmdbImage) bool) string {
		best, bestVotes := "", -1.0
		for _, img := range images {
			if !isRenderable(img.FilePath) || !match(img) {
				continue
			}
			if img.VoteAverage > bestVotes {
				best, bestVotes = img.FilePath, img.VoteAverage
			}
		}
		return best
	}

	inLang := func(img tmdbImage) bool { return lang != "" && langOf(img) == lang }
	textless := func(img tmdbImage) bool { return langOf(img) == "" }
	// A language commonly spans two countries — es is ES and MX, pt is BR and
	// PT — and TMDB says which on every image that carries a language. Artwork
	// for the wrong one is still in the right language, so this narrows within
	// a language rather than replacing the language preference.
	//
	// Textless art is never demoted by it: measured over 1483 posters on five
	// titles, no image carries a country without a language, so a textless image
	// has neither and never reaches this comparison.
	region := artworkRegion(opts)
	inLangAndRegion := func(img tmdbImage) bool {
		return inLang(img) && img.Iso3166 != nil && strings.EqualFold(*img.Iso3166, region)
	}

	switch pref {
	case "textless", "clean":
		if p := bestBy(textless); p != "" {
			return p
		}
	case "alternative":
		// The top-voted non-default candidate is almost always a near-twin of
		// the canonical art (alternate scans of the same poster), so rank the
		// non-default candidates and skip one to reach visibly different art.
		base := defaultPath
		if base == "" {
			base = bestBy(func(tmdbImage) bool { return true })
		}
		var candidates []tmdbImage
		for _, img := range images {
			if !isRenderable(img.FilePath) || img.FilePath == base {
				continue
			}
			// Same quality floors as the random path. Both reach past the
			// canonical poster into community uploads, which are downvoted
			// rather than removed when they are wrong for the title.
			if !passesQualityFloor(img, opts) {
				continue
			}
			if lang == "" || inLang(img) || langOf(img) == "en" || textless(img) {
				candidates = append(candidates, img)
			}
		}
		sort.Slice(candidates, func(i, j int) bool {
			return candidates[i].VoteAverage > candidates[j].VoteAverage
		})
		if len(candidates) > 1 {
			return candidates[1].FilePath
		}
		if len(candidates) == 1 {
			return candidates[0].FilePath
		}
	case "random":
		candidates := make([]tmdbImage, 0, len(images))
		for _, img := range images {
			if !isRenderable(img.FilePath) {
				continue
			}
			switch opts.RandomText {
			case "text":
				if textless(img) {
					continue
				}
			case "textless":
				if !textless(img) {
					continue
				}
			}
			if opts.RandomLanguage == "requested" && lang != "" && !inLang(img) {
				continue
			}
			if !passesQualityFloor(img, opts) {
				continue
			}
			candidates = append(candidates, img)
		}
		if len(candidates) > 0 {
			return candidates[rand.Intn(len(candidates))].FilePath
		}
		// No candidate passed the filters — fall back.
		if opts.RandomFallback == "original" {
			return defaultPath
		}
		if p := bestBy(func(tmdbImage) bool { return true }); p != "" {
			return p
		}
	}

	// Language preference applies to the default/original path too: a
	// requested non-English language wins over TMDB's canonical pick.
	if lang != "" && lang != "en" {
		// The region is a preference inside the language and not a filter: a
		// title with no artwork for this country still gets its language.
		if p := bestBy(inLangAndRegion); p != "" {
			return p
		}
		if p := bestBy(inLang); p != "" {
			return p
		}
	}
	// Nothing in the requested language, so try the fallback before falling
	// through to TMDB's canonical pick, which is usually English.
	if fb := imageLanguageOf(opts.FallbackLanguage); fb != "" && fb != lang {
		if p := bestBy(func(img tmdbImage) bool { return langOf(img) == fb }); p != "" {
			return p
		}
	}
	if defaultPath != "" {
		return defaultPath
	}

	// No canonical pick to fall back on — logos have none. The pool is only
	// pre-filtered to the requested language when one was sent to the API, and
	// the original-language request cannot send one, so it comes back in every
	// language. Picking the top vote out of that lands a Portuguese wordmark on
	// an English title; the language still has to be honoured here, including
	// "en", which the guard above deliberately skips.
	if lang != "" {
		if p := bestBy(inLang); p != "" {
			return p
		}
	}
	// English is preferred before a language-neutral pick, because TMDB's "no
	// language" tag is unreliable: it marks both genuine wordmarks and untagged
	// foreign logos, so a Cyrillic logo can arrive tagged neutral. A known
	// English wordmark most viewers can read beats trusting that tag.
	if p := bestBy(func(img tmdbImage) bool { return langOf(img) == "en" }); p != "" {
		return p
	}
	// No English either: a language-neutral wordmark still beats art tagged for a
	// language nobody asked for.
	if p := bestBy(textless); p != "" {
		return p
	}
	return bestBy(func(tmdbImage) bool { return true })
}

// pathIsTextless reports whether path names one of TMDB's language-neutral
// candidates. TMDB tags art carrying a title with its language, so an absent or
// empty iso_639_1 is the signal. An unknown path counts as not textless, which
// keeps the logo overlay off art nothing has confirmed is bare.
func pathIsTextless(images []tmdbImage, path string) bool {
	if path == "" {
		return false
	}
	for _, img := range images {
		if img.FilePath != path {
			continue
		}
		return img.Iso639 == nil || strings.TrimSpace(*img.Iso639) == ""
	}
	return false
}

// pathHasLanguage reports that TMDB tagged this image with a language, which is
// how it marks artwork carrying text. Absent or unknown returns false.
func pathHasLanguage(images []tmdbImage, path string) bool {
	if path == "" {
		return false
	}
	for _, img := range images {
		if img.FilePath != path {
			continue
		}
		return img.Iso639 != nil && strings.TrimSpace(*img.Iso639) != ""
	}
	return false
}

// TitleResult is one search/trending hit.
type TitleResult struct {
	TMDBID    int    `json:"tmdbId"`
	MediaType string `json:"mediaType"` // movie | tv
	Title     string `json:"title"`
	Year      int    `json:"year"`
}

type tmdbListItem struct {
	ID           int    `json:"id"`
	MediaType    string `json:"media_type"`
	Title        string `json:"title"`
	Name         string `json:"name"`
	ReleaseDate  string `json:"release_date"`
	FirstAirDate string `json:"first_air_date"`
}

func toTitleResults(items []tmdbListItem, limit int) []TitleResult {
	out := make([]TitleResult, 0, limit)
	for _, it := range items {
		if it.MediaType != "movie" && it.MediaType != "tv" {
			continue
		}
		title := it.Title
		if title == "" {
			title = it.Name
		}
		if title == "" {
			continue
		}
		date := it.ReleaseDate
		if date == "" {
			date = it.FirstAirDate
		}
		year := 0
		if len(date) >= 4 {
			year, _ = strconv.Atoi(date[:4])
		}
		out = append(out, TitleResult{TMDBID: it.ID, MediaType: it.MediaType, Title: title, Year: year})
		if len(out) >= limit {
			break
		}
	}
	return out
}

// SearchTitles finds movies and TV shows matching the query.
func (t *TMDB) SearchTitles(ctx context.Context, query string) ([]TitleResult, error) {
	var result struct {
		Results []tmdbListItem `json:"results"`
	}
	path := t.base() + "/search/multi?include_adult=false&query=" + url.QueryEscape(query)
	if err := t.get(ctx, path, &result); err != nil {
		return nil, err
	}
	return toTitleResults(result.Results, 8), nil
}

// TrendingTitles returns this week's trending movies and TV shows.
func (t *TMDB) TrendingTitles(ctx context.Context) ([]TitleResult, error) {
	var result struct {
		Results []tmdbListItem `json:"results"`
	}
	if err := t.get(ctx, t.base()+"/trending/all/week", &result); err != nil {
		return nil, err
	}
	return toTitleResults(result.Results, 20), nil
}

// LookupIMDbID resolves a TMDB ID to its IMDb tt-ID (may be empty).
func (t *TMDB) LookupIMDbID(ctx context.Context, mediaType string, tmdbID int) (string, error) {
	var result struct {
		IMDbID string `json:"imdb_id"`
	}
	path := t.base() + "/" + mediaType + "/" + strconv.Itoa(tmdbID) + "/external_ids"
	if err := t.get(ctx, path, &result); err != nil {
		return "", err
	}
	return result.IMDbID, nil
}

func (t *TMDB) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, path, nil)
	if err != nil {
		return err
	}
	apiKey, readToken := t.credentials(ctx)
	if readToken != "" {
		req.Header.Set("Authorization", "Bearer "+readToken)
	} else {
		q := req.URL.Query()
		q.Set("api_key", apiKey)
		req.URL.RawQuery = q.Encode()
	}
	resp, err := t.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http get: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return &tmdbStatusError{Code: resp.StatusCode, Path: path}
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// TMDB release types: 2 and 3 are limited and wide theatrical, 4 is digital.
const (
	releaseTypeTheatricalLimited = 2
	releaseTypeTheatrical        = 3
	releaseTypeDigital           = 4
)

// releaseEntry is one region's record of a release of a given kind.
type releaseEntry struct {
	kind int
	date string
}

// releaseLanded reports whether any entry of one of the given kinds has already
// happened. An entry with an unparseable date counts as landed: TMDB records
// releases it knows about but cannot date, and those are titles already out.
func releaseLanded(entries []releaseEntry, now time.Time, kinds ...int) bool {
	for _, e := range entries {
		matched := false
		for _, k := range kinds {
			if e.kind == k {
				matched = true
				break
			}
		}
		if !matched {
			continue
		}
		ts, err := time.Parse("2006-01-02T15:04:05.000Z", e.date)
		if err != nil || !ts.After(now) {
			return true
		}
	}
	return false
}

// releaseRegion is the country a release date is read for. It reuses the
// streaming region rather than adding a second country for a user to keep in
// step with the first.
func releaseRegion(country string) string {
	if r := strings.ToUpper(strings.TrimSpace(country)); r != "" {
		return r
	}
	return "US"
}

// allBadgeReleaseKinds are the TMDB release types the badge can name.
var allBadgeReleaseKinds = []int{releaseTypeTheatricalLimited, releaseTypeTheatrical, releaseTypeDigital}

// nextRelease returns the soonest release still ahead, across the given kinds. An undated entry counts as landed, as it does for the status, so
// a title TMDB cannot date draws nothing.
func nextRelease(entries []releaseEntry, now time.Time, kinds ...int) UpcomingRelease {
	want := map[int]bool{}
	for _, k := range kinds {
		want[k] = true
	}
	var out UpcomingRelease
	for _, e := range entries {
		if !want[e.kind] {
			continue
		}
		var kind string
		switch e.kind {
		case releaseTypeDigital:
			kind = "digital"
		case releaseTypeTheatricalLimited, releaseTypeTheatrical:
			kind = "cinemas"
		default:
			continue
		}
		ts, err := time.Parse("2006-01-02T15:04:05.000Z", e.date)
		if err != nil || !ts.After(now) {
			continue
		}
		if out.Date.IsZero() || ts.Before(out.Date) {
			out = UpcomingRelease{Kind: kind, Date: ts}
		}
	}
	return out
}

// resolveReleaseStatus picks the badge-worthy release state, preferring digital
// because a title available at home has moved past its cinema run.
func resolveReleaseStatus(entries []releaseEntry, now time.Time) string {
	switch {
	case releaseLanded(entries, now, releaseTypeDigital):
		return "digital"
	case releaseLanded(entries, now, releaseTypeTheatricalLimited, releaseTypeTheatrical):
		return "cinemas"
	}
	return ""
}
