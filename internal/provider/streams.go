package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"xrdb_rewrite/internal/logging"
)

// streamsMaxBody bounds the response read from a stream addon. A busy title on
// an aggregating addon runs past a megabyte, and the addon is usually on the
// same host, so the cap is there to keep a misbehaving one from being read
// without end rather than to be reached in normal use.
const streamsMaxBody = 16 << 20

// qualityPatterns map a badge token onto the release names that imply it. The
// names are scene-style filenames, so the marker is a bare word between
// separators: matching on substrings alone turns "DVDRip" into Dolby Vision.
var qualityPatterns = map[string]*regexp.Regexp{
	"4k":        regexp.MustCompile(`\b(?:2160P?|4K|UHD|ULTRA[ ._-]?HD)\b`),
	"hd":        regexp.MustCompile(`\b(?:1080P|720P|FULL[ ._-]?HD|FHD)\b`),
	"hdr10plus": regexp.MustCompile(`\bHDR10\+|\bHDR10PLUS\b`),
	"hdr10":     regexp.MustCompile(`\bHDR10\b`),
	"hdr":       regexp.MustCompile(`\bHDR\b|\bHLG\b|\bPQ10\b`),
	"dv":        regexp.MustCompile(`\bDV\b|\bDOVI\b|DOLBY[ ._-]*VISION`),
	"atmos":     regexp.MustCompile(`\bATMOS\b`),
	"dts":       regexp.MustCompile(`\bDTS\b|\bDTS[ ._-]?(?:HD|X|ES)\b`),
	"imax":      regexp.MustCompile(`\bIMAX\b`),
	"bluray":    regexp.MustCompile(`\bBLU[ ._-]?RAY\b|\bBD(?:RIP|MV|REMUX|25|50)\b|\bBRRIP\b`),
	"remux":     regexp.MustCompile(`\bREMUX\b|\bBDREMUX\b`),
}

// DetectQuality reports which badge tokens the given release names carry.
// Names arrive already split out of an addon's stream list.
func DetectQuality(names []string) map[string]bool {
	found := make(map[string]bool, len(qualityPatterns)+1)
	for _, name := range names {
		if name == "" {
			continue
		}
		upper := strings.ToUpper(name)
		for token, pattern := range qualityPatterns {
			if found[token] {
				continue
			}
			if pattern.MatchString(upper) {
				found[token] = true
			}
		}
		if len(found) == len(qualityPatterns) {
			break
		}
	}
	applyQualityImplications(found)
	return found
}

// applyQualityImplications fills in the tokens a detected one stands for.
// A name says "HDR10+" and never also says "HDR", but a poster claiming HDR10+
// while withholding HDR would be reporting a title as less than it is.
func applyQualityImplications(found map[string]bool) {
	if found["hdr10plus"] {
		found["hdr10"] = true
	}
	if found["hdr10"] || found["dv"] {
		found["hdr"] = true
	}
	// bdremux is the pair drawn as one tile, so it stands only where both halves do.
	if found["bluray"] && found["remux"] {
		found["bdremux"] = true
	}
}

// StreamQuality reports which release qualities exist for a title by asking a
// Stremio stream addon. Comet and Torrentio both answer the same shape, so the
// base URL decides which one is asked. A configured addon URL (one carrying a
// debrid token) answers for that account, which narrows the reading from "this
// exists somewhere" to "this is available to you".
type StreamQuality struct {
	baseURL    string
	httpClient *http.Client
}

// NewStreamQuality builds a client against a stream addon base URL. A URL
// ending in /manifest.json is accepted as-is from an addon install link.
func NewStreamQuality(baseURL string, timeout time.Duration) *StreamQuality {
	if timeout <= 0 {
		timeout = 5 * time.Second
	}
	return &StreamQuality{
		baseURL:    NormalizeStreamBaseURL(baseURL),
		httpClient: newHTTPClient("streams", timeout),
	}
}

// NormalizeStreamBaseURL trims an addon URL down to the prefix a stream path
// is appended to, accepting the install link the addon hands out.
func NormalizeStreamBaseURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.TrimPrefix(trimmed, "stremio://")
	trimmed = strings.TrimSuffix(trimmed, "/manifest.json")
	return strings.TrimRight(trimmed, "/")
}

func (s *StreamQuality) Name() string { return "streams" }

// BaseURL reports the addon this client asks, for startup logging.
func (s *StreamQuality) BaseURL() string { return s.baseURL }

// StreamID builds the id a stream addon expects: a bare IMDb id for a film,
// and one qualified by season and episode for an episode of a series.
func StreamID(id string, season, episode int) string {
	if season > 0 && episode > 0 {
		return fmt.Sprintf("%s:%d:%d", id, season, episode)
	}
	return id
}

// Detect reports the badge tokens available for a title. contentType is the
// addon's own vocabulary: "movie" or "series".
func (s *StreamQuality) Detect(ctx context.Context, contentType, id string) (map[string]bool, error) {
	if s == nil || s.baseURL == "" {
		return nil, fmt.Errorf("streams: no addon configured")
	}
	if !strings.HasPrefix(id, "tt") {
		return nil, fmt.Errorf("streams: only IMDb tt-IDs supported, got %q", id)
	}

	url := s.baseURL + "/stream/" + contentType + "/" + id + ".json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := s.httpClient.Do(req)
	if err != nil {
		// Not redactHTTPErr: that clears the query, and an addon keeps its
		// configuration — debrid token included — in the path instead.
		return nil, fmt.Errorf("streams: %s: %w", logging.RedactURL(url), unwrapURLError(err))
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("streams: http %d for %s", resp.StatusCode, logging.RedactURL(url))
	}

	var payload struct {
		Streams []struct {
			Name  string `json:"name"`
			Title string `json:"title"`
			// Description is where the Stremio addon SDK moved the detail line
			// that older addons put in Title, and where Comet writes its own
			// parse of the release. A bare filename says nothing; that line
			// still names the resolution and the audio format.
			Description   string `json:"description"`
			BehaviorHints struct {
				Filename string `json:"filename"`
			} `json:"behaviorHints"`
		} `json:"streams"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, streamsMaxBody)).Decode(&payload); err != nil {
		return nil, fmt.Errorf("streams: decode: %w", err)
	}

	names := make([]string, 0, len(payload.Streams)*3)
	for _, st := range payload.Streams {
		for _, candidate := range []string{st.BehaviorHints.Filename, st.Title, st.Description, st.Name} {
			if candidate = strings.TrimSpace(candidate); candidate != "" {
				names = append(names, candidate)
			}
		}
	}
	if len(names) == 0 {
		// A title nothing carries is a fact about the title, not a failure, and
		// the empty set is the honest answer for it.
		return map[string]bool{}, nil
	}
	return DetectQuality(names), nil
}

// unwrapURLError drops the URL that net/http wraps around a transport error,
// keeping the cause. The URL is reattached already redacted.
func unwrapURLError(err error) error {
	var ue *url.Error
	if errors.As(err, &ue) {
		return ue.Err
	}
	return err
}
