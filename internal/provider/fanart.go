package provider

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

const fanartMoviesURL = "https://webservice.fanart.tv/v3/movies/"
const fanartTVURL = "https://webservice.fanart.tv/v3/tv/"

// Fanart is the Fanart.tv metadata provider.
// It returns high-quality logos, posters, and art images.
type Fanart struct {
	mu         sync.RWMutex
	apiKey     string
	httpClient *http.Client
	// Endpoint overrides for tests. Empty means the public Fanart.tv URLs.
	moviesURL string
	tvURL     string
}

func (f *Fanart) moviesEndpoint() string {
	if f.moviesURL != "" {
		return f.moviesURL
	}
	return fanartMoviesURL
}

func (f *Fanart) tvEndpoint() string {
	if f.tvURL != "" {
		return f.tvURL
	}
	return fanartTVURL
}

// UpdateCredentials swaps the live credential so a value saved in the UI takes
// effect without a restart.
func (f *Fanart) UpdateCredentials(apiKey string) {
	f.mu.Lock()
	f.apiKey = apiKey
	f.mu.Unlock()
}

// RatingSources is empty: Fanart serves artwork only. Declaring it keeps the
// provider out of the ratings fan-out.
func (f *Fanart) RatingSources() []string { return nil }

// HasCredentials reports whether the provider can make authenticated requests.
func (f *Fanart) HasCredentials() bool {
	return f.cred(context.Background()) != ""
}

func (f *Fanart) cred(ctx context.Context) string {
	// An owner-supplied credential stands in for the server's for this render.
	if k := keyFrom(ctx, KeyFanart); k != "" {
		return k
	}
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.apiKey
}

// NewFanart creates a Fanart.tv provider.
func NewFanart(apiKey string) *Fanart {
	return &Fanart{
		apiKey:     apiKey,
		httpClient: newHTTPClient("fanart", 10*time.Second),
	}
}

func (f *Fanart) Name() string { return "fanart" }

// Fetch retrieves Fanart.tv artwork for a media item.
func (f *Fanart) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	return f.FetchArtwork(ctx, mediaType, id, ArtworkOptions{})
}

// FetchArtwork retrieves Fanart.tv artwork, preferring images in the
// requested language when available.
func (f *Fanart) FetchArtwork(ctx context.Context, mediaType, id string, opts ArtworkOptions) (*MediaMeta, error) {
	if f.cred(ctx) == "" {
		return nil, fmt.Errorf("fanart: no api key configured")
	}

	raw, err := f.fetchRecord(ctx, mediaType, id)
	if err != nil {
		return nil, err
	}

	// Fanart's id index is the only thing tying this record to the request, and
	// it carries wrong tt-ids. Its own TMDB id is the check on the match.
	if want := strings.TrimSpace(opts.TMDBID); want != "" {
		if got := fanartRecordTMDBID(raw); got != "" && got != want {
			return nil, fmt.Errorf("fanart: record is tmdb %s, not %s, for id %q", got, want, id)
		}
	}

	lang := strings.ToLower(strings.TrimSpace(opts.Language))
	// Fanart records carry no original-language marker, so there is nothing here
	// to resolve it against; the usual English-then-any order applies.
	if IsOriginalLanguage(lang) {
		lang = ""
	}
	// Fanart.tv tags language-neutral (textless) art with lang "00".
	switch opts.TextPreference {
	case "textless", "clean":
		lang = "00"
	}
	skip := 0
	if opts.TextPreference == "alternative" {
		skip = 1
	}
	// The record name stays internal to the check above: title-keyed rating
	// lookups read MediaMeta.Title, and this one is not an authority on it.
	meta := &MediaMeta{}
	meta.PosterURL = pickFanartURL(raw, lang, skip, "movieposter", "tvposter")
	// pickFanartURL falls back through language buckets, so a "00" request can
	// still come back as English art with the title on it. Report what arrived.
	meta.PosterTextless = fanartURLIsLang(raw, meta.PosterURL, "00", "movieposter", "tvposter")
	meta.BackdropURL = pickFanartURL(raw, lang, skip, "moviebackground", "showbackground")
	meta.LogoURL = pickFanartURL(raw, lang, 0, "hdmovielogo", "hdtvlogo", "movielogo", "clearlogo")

	if meta.PosterURL == "" && meta.BackdropURL == "" && meta.LogoURL == "" {
		return nil, fmt.Errorf("fanart: no artwork found for id %q", id)
	}

	return meta, nil
}

// fetchRecord picks the endpoint that can answer for this content type.
//
// The movies endpoint accepts both IMDb tt-ids and TMDB numeric ids; the TV
// endpoint accepts TVDB numeric ids only. A series under a tt-id therefore has
// no endpoint that can answer it, and the movies endpoint answering anyway is a
// movie record wearing the series' id.
func (f *Fanart) fetchRecord(ctx context.Context, mediaType, id string) (map[string]json.RawMessage, error) {
	if isSeriesType(mediaType) {
		if strings.HasPrefix(id, "tt") {
			return nil, fmt.Errorf("fanart: series %q needs a tvdb id, tt-ids resolve to movie records", id)
		}
		return f.fetchRaw(ctx, f.tvEndpoint(), id)
	}
	raw, err := f.fetchRaw(ctx, f.moviesEndpoint(), id)
	// A caller that did not commit to "movie" may still hold a TVDB id.
	if err != nil && !isMovieType(mediaType) && !strings.HasPrefix(id, "tt") {
		raw, err = f.fetchRaw(ctx, f.tvEndpoint(), id)
	}
	return raw, err
}

// fanartRecordTMDBID reads the TMDB id Fanart holds for the record, or "".
// Fanart sends it as a string, but tolerate a bare number.
func fanartRecordTMDBID(raw map[string]json.RawMessage) string {
	data, ok := raw["tmdb_id"]
	if !ok {
		return ""
	}
	var asString string
	if err := json.Unmarshal(data, &asString); err == nil {
		return strings.TrimSpace(asString)
	}
	var asNumber json.Number
	if err := json.Unmarshal(data, &asNumber); err == nil {
		return asNumber.String()
	}
	return ""
}

func (f *Fanart) fetchRaw(ctx context.Context, base, id string) (map[string]json.RawMessage, error) {
	url := base + id + "?api_key=" + f.cred(ctx)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("fanart: build request: %w", err)
	}

	resp, err := f.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fanart: http get: %w", redactHTTPErr(err))
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("fanart: media not found for id %q", id)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fanart: http %d", resp.StatusCode)
	}

	var raw map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("fanart: decode response: %w", err)
	}
	return raw, nil
}

type fanartImage struct {
	URL  string `json:"url"`
	Lang string `json:"lang"`
	ID   string `json:"id"`
}

// bestFanartURL picks the best URL from the given image type keys.
// Prefers the requested language, then English, then first available.
func bestFanartURL(raw map[string]json.RawMessage, lang string, keys ...string) string {
	return pickFanartURL(raw, lang, 0, keys...)
}

// pickFanartURL picks a URL from the given image type keys, preferring the
// requested language, then English, then any. skip selects a later entry in
// the preferred bucket (for "alternative" art) when one exists.
// fanartURLIsLang reports whether url is tagged with lang in the record. Fanart
// tags language-neutral art "00", which is how textless art is identified. An
// unknown url counts as not matching, so the logo overlay stays off art nothing
// has confirmed is bare.
func fanartURLIsLang(raw map[string]json.RawMessage, url, lang string, keys ...string) bool {
	if url == "" {
		return false
	}
	for _, key := range keys {
		data, ok := raw[key]
		if !ok {
			continue
		}
		var images []fanartImage
		if err := json.Unmarshal(data, &images); err != nil {
			continue
		}
		for _, img := range images {
			if img.URL == url {
				return img.Lang == lang
			}
		}
	}
	return false
}

func pickFanartURL(raw map[string]json.RawMessage, lang string, skip int, keys ...string) string {
	for _, key := range keys {
		data, ok := raw[key]
		if !ok {
			continue
		}
		var images []fanartImage
		if err := json.Unmarshal(data, &images); err != nil || len(images) == 0 {
			continue
		}
		buckets := [][]string{}
		collect := func(match func(fanartImage) bool) {
			var urls []string
			for _, img := range images {
				if img.URL != "" && match(img) {
					urls = append(urls, img.URL)
				}
			}
			if len(urls) > 0 {
				buckets = append(buckets, urls)
			}
		}
		if lang != "" {
			collect(func(img fanartImage) bool { return img.Lang == lang })
		}
		collect(func(img fanartImage) bool { return img.Lang == "en" })
		collect(func(img fanartImage) bool { return true })

		for _, urls := range buckets {
			if skip < len(urls) {
				return urls[skip]
			}
			return urls[0]
		}
	}
	return ""
}
