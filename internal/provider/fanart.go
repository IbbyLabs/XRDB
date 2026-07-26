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
// The movies endpoint accepts both IMDb tt-IDs and TMDB numeric IDs; the TV
// endpoint requires a TVDB numeric ID, so it is only tried for numeric IDs.
func (f *Fanart) Fetch(ctx context.Context, mediaType, id string) (*MediaMeta, error) {
	return f.FetchArtwork(ctx, mediaType, id, ArtworkOptions{})
}

// FetchArtwork retrieves Fanart.tv artwork, preferring images in the
// requested language when available.
func (f *Fanart) FetchArtwork(ctx context.Context, mediaType, id string, opts ArtworkOptions) (*MediaMeta, error) {
	if f.cred(ctx) == "" {
		return nil, fmt.Errorf("fanart: no api key configured")
	}

	// The output family (poster/backdrop/...) doesn't tell us movie vs TV,
	// so try movies first, then TV for numeric (TVDB) IDs.
	raw, err := f.fetchRaw(ctx, fanartMoviesURL, id)
	if err != nil && !strings.HasPrefix(id, "tt") {
		raw, err = f.fetchRaw(ctx, fanartTVURL, id)
	}
	if err != nil {
		return nil, err
	}

	lang := strings.ToLower(strings.TrimSpace(opts.Language))
	// Fanart.tv tags language-neutral (textless) art with lang "00".
	switch opts.TextPreference {
	case "textless", "clean":
		lang = "00"
	}
	skip := 0
	if opts.TextPreference == "alternative" {
		skip = 1
	}
	meta := &MediaMeta{}
	meta.PosterURL = pickFanartURL(raw, lang, skip, "movieposter", "tvposter")
	meta.BackdropURL = pickFanartURL(raw, lang, skip, "moviebackground", "showbackground")
	meta.LogoURL = pickFanartURL(raw, lang, 0, "hdmovielogo", "hdtvlogo", "movielogo", "clearlogo")

	if meta.PosterURL == "" && meta.BackdropURL == "" && meta.LogoURL == "" {
		return nil, fmt.Errorf("fanart: no artwork found for id %q", id)
	}

	return meta, nil
}

func (f *Fanart) fetchRaw(ctx context.Context, base, id string) (map[string]json.RawMessage, error) {
	url := base + id + "?api_key=" + f.cred(ctx)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("fanart: build request: %w", err)
	}

	resp, err := f.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fanart: http get: %w", err)
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
