package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"xrdb_rewrite/internal/compose"
	"xrdb_rewrite/internal/config"
)

// Discord's Components V2 opt-in, and the three component types the panel uses.
const (
	discordComponentsV2 = 1 << 15
	componentContainer  = 17
	componentText       = 10
	componentSeparator  = 14
)

// Panel accents. Blue is the XRDB accent; amber marks a state a reader should
// act on. Reds are reserved for the tracker's own outage alerts, so the two
// surfaces cannot be confused at a glance.
const (
	accentWorking  = 0x0071BB
	accentDegraded = 0xD98A00
)

// ratingLabel names a badge the way the configurator names it, in the order the
// configurator lists them, so related ratings stay adjacent. Kept in step with
// RATING_OPTIONS by TestThePanelNamesRatingsLikeTheConfigurator.
var ratingLabels = []struct{ ID, Label string }{
	{"imdb", "IMDb"},
	{"tmdb", "TMDB"},
	{"rt", "RT Critics"},
	{"rtaudience", "RT Audience"},
	{"metacritic", "Metacritic"},
	{"metacriticuser", "Metacritic User"},
	{"letterboxd", "Letterboxd"},
	{"mdblist", "MDBList"},
	{"trakt", "Trakt"},
	{"simkl", "SIMKL"},
	{"rogerebert", "Roger Ebert"},
	{"allocine", "AlloCiné"},
	{"allocinepress", "AlloCiné Press"},
	{"filmweb", "Filmweb"},
	{"mal", "MyAnimeList"},
	{"anilist", "AniList"},
	{"kitsu", "Kitsu"},
}

// artworkLabels names an artwork source as a profile names it.
var artworkLabels = map[string]string{
	"tmdb":     "TMDB",
	"fanart":   "Fanart",
	"cinemeta": "Cinemeta",
	"omdb":     "OMDb",
	"kitsu":    "Kitsu",
	"mediux":   "MediUX",
}

// panelState is the whole of what the panel says. Two equal states render the
// same text, which is what lets the panel be edited on change rather than on a
// timer.
type panelState struct {
	Ratings     []string `json:"ratings"`
	Artwork     []string `json:"artwork"`
	FallbackOut bool     `json:"fallback_out"`
}

func (s panelState) same(o panelState) bool {
	return s.FallbackOut == o.FallbackOut &&
		slicesEqual(s.Ratings, o.Ratings) && slicesEqual(s.Artwork, o.Artwork)
}

func slicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// panelRecord is what survives a restart. Without the message id a restart
// posts a second panel rather than editing the one already there.
type panelRecord struct {
	MessageID string     `json:"message_id"`
	State     panelState `json:"state"`
	ChangedAt time.Time  `json:"changed_at"`
}

func readPanelRecord(path string) panelRecord {
	var rec panelRecord
	data, err := os.ReadFile(path)
	if err != nil {
		return rec
	}
	// A record that will not parse is treated as absent. The cost is one
	// duplicate panel; refusing to run would leave the channel frozen.
	_ = json.Unmarshal(data, &rec)
	return rec
}

// writePanelRecord replaces the record through a temporary file, so a crash
// mid-write cannot leave a truncated one that reads as no message id at all.
func writePanelRecord(path string, rec panelRecord) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// currentPanelState reads what a render can reach right now.
func currentPanelState(p *compose.Pipeline) panelState {
	st := panelState{
		Ratings: p.UnavailableRatings(),
		Artwork: p.UnavailableArtworkSources(),
	}
	st.FallbackOut = !p.ArtworkFallbackReachable()
	sort.Strings(st.Ratings)
	sort.Strings(st.Artwork)
	return st
}

// labelRatings names the given badge ids in configurator order. An id with no
// label is passed through rather than dropped, so a badge added to a provider
// before the table appears as itself instead of vanishing.
func labelRatings(ids []string) []string {
	want := make(map[string]bool, len(ids))
	for _, id := range ids {
		want[id] = true
	}
	out := make([]string, 0, len(ids))
	for _, r := range ratingLabels {
		if want[r.ID] {
			out = append(out, r.Label)
			delete(want, r.ID)
		}
	}
	rest := make([]string, 0, len(want))
	for id := range want {
		rest = append(rest, id)
	}
	sort.Strings(rest)
	return append(out, rest...)
}

func labelArtwork(ids []string) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if label, ok := artworkLabels[id]; ok {
			out = append(out, label)
			continue
		}
		out = append(out, id)
	}
	return out
}

// renderPanel builds the Components V2 payload for a state.
func renderPanel(st panelState, changed time.Time, trackerChannelID string) map[string]any {
	stamp := changed.Unix()
	accent := accentWorking
	if len(st.Ratings) > 0 || len(st.Artwork) > 0 {
		accent = accentDegraded
	}

	body := []map[string]any{
		{"type": componentText, "content": "# What's working"},
		{"type": componentSeparator},
		{"type": componentText, "content": ratingSection(st)},
		{"type": componentSeparator},
		{"type": componentText, "content": artworkSection(st)},
		{"type": componentSeparator},
		{"type": componentText, "content": fmt.Sprintf(
			"-# Updated <t:%d:t> · <t:%d:R>", stamp, stamp)},
		{"type": componentText, "content": panelFooter(trackerChannelID)},
	}
	return map[string]any{
		"flags": discordComponentsV2,
		"components": []map[string]any{{
			"type":         componentContainer,
			"accent_color": accent,
			"components":   body,
		}},
	}
}

func ratingSection(st panelState) string {
	if len(st.Ratings) == 0 {
		return "**All rating badges working**\nEvery badge has a source that answers."
	}
	names := labelRatings(st.Ratings)
	return fmt.Sprintf("**Some rating badges missing**\n%s %s currently unavailable. "+
		"Every other badge is unaffected.", strings.Join(names, ", "), isAre(len(names)))
}

func artworkSection(st panelState) string {
	if len(st.Artwork) == 0 {
		return "**All artwork sources working**\nPosters, backdrops and logos are rendering normally."
	}
	names := labelArtwork(st.Artwork)
	line := fmt.Sprintf("**Some artwork sources unavailable**\n%s %s not answering.",
		strings.Join(names, ", "), isAre(len(names)))
	if st.FallbackOut {
		return line + " No fallback source is reachable, so artwork may be missing."
	}
	return line + " Renders fall back to a source that is still working."
}

// isAre keeps the verb agreeing with a list whose length is not known until it
// is built. Ibby asked for the phrasing to be consistent rather than for the
// word to always be there.
func isAre(n int) string {
	if n == 1 {
		return "is"
	}
	return "are"
}

func panelFooter(trackerChannelID string) string {
	const text = "-# A quiet panel is a working one: this is edited only when something changes."
	if trackerChannelID == "" {
		return text
	}
	return fmt.Sprintf("%s <#%s> has the full picture, including whether XRDB itself is up.",
		text, trackerChannelID)
}

// panelPoster talks to one Discord webhook.
type panelPoster struct {
	URL    string
	Client *http.Client
}

// post creates the panel and returns the new message id.
func (p panelPoster) post(ctx context.Context, payload map[string]any) (string, error) {
	body, err := p.do(ctx, http.MethodPost, p.URL+"?wait=true&with_components=true", payload)
	if err != nil {
		return "", err
	}
	var msg struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &msg); err != nil || msg.ID == "" {
		return "", fmt.Errorf("the webhook accepted the panel but named no message id")
	}
	return msg.ID, nil
}

// edit rewrites an existing panel. gone is true when the message no longer
// exists, which is the state after someone deletes it by hand.
func (p panelPoster) edit(ctx context.Context, id string, payload map[string]any) (gone bool, err error) {
	url := fmt.Sprintf("%s/messages/%s?with_components=true", p.URL, id)
	_, err = p.do(ctx, http.MethodPatch, url, payload)
	var status statusError
	if err != nil && errors.As(err, &status) && status.Code == http.StatusNotFound {
		return true, nil
	}
	return false, err
}

// statusError carries a refused response without its body, which for a webhook
// can echo the payload back.
type statusError struct {
	Code   int
	Reason string
}

func (e statusError) Error() string {
	return fmt.Sprintf("the webhook refused the panel: %d %s", e.Code, e.Reason)
}

func (p panelPoster) do(ctx context.Context, method, url string, payload map[string]any) ([]byte, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, statusError{Code: resp.StatusCode, Reason: http.StatusText(resp.StatusCode)}
	}
	return body, nil
}

// syncPanel brings the channel in line with the current state. It posts when
// there is nothing to edit, edits when the state has moved, and does nothing
// when it has not.
func syncPanel(
	ctx context.Context,
	cfg config.StatusPanel,
	poster panelPoster,
	pipeline *compose.Pipeline,
	now time.Time,
	logger *slog.Logger,
) {
	state := currentPanelState(pipeline)
	rec := readPanelRecord(cfg.StatePath)

	if rec.MessageID != "" && state.same(rec.State) {
		return
	}

	changed := now
	payload := renderPanel(state, changed, cfg.TrackerChannelID)

	if rec.MessageID != "" {
		gone, err := poster.edit(ctx, rec.MessageID, payload)
		if err != nil {
			logger.ErrorContext(ctx, "Could not edit the status panel",
				"error", err, "ratings_out", len(state.Ratings),
				"artwork_out", len(state.Artwork))
			return
		}
		if !gone {
			save(ctx, cfg.StatePath, panelRecord{
				MessageID: rec.MessageID, State: state, ChangedAt: changed,
			}, logger)
			logger.InfoContext(ctx, "Edited the status panel, the state moved",
				"ratings_out", len(state.Ratings), "artwork_out", len(state.Artwork),
				"artwork_fallback_out", state.FallbackOut)
			return
		}
		logger.WarnContext(ctx, "The status panel was deleted, posting a new one",
			"message_id", rec.MessageID)
	}

	id, err := poster.post(ctx, payload)
	if err != nil {
		logger.ErrorContext(ctx, "Could not post the status panel", "error", err)
		return
	}
	save(ctx, cfg.StatePath, panelRecord{MessageID: id, State: state, ChangedAt: changed}, logger)
	logger.InfoContext(ctx, "Posted the status panel",
		"message_id", id, "ratings_out", len(state.Ratings),
		"artwork_out", len(state.Artwork))
}

// save records the panel so a restart edits rather than reposts. A failure here
// is logged rather than fatal: the panel in the channel is already correct, and
// the cost is a duplicate after the next restart.
func save(ctx context.Context, path string, rec panelRecord, logger *slog.Logger) {
	if err := writePanelRecord(path, rec); err != nil {
		logger.ErrorContext(ctx, "Could not record the status panel's message id",
			"path", path, "error", err)
	}
}

// StartStatusPanel keeps a panel in a public Discord channel naming the sources
// a render cannot currently reach. Disabled unless a webhook is configured.
func StartStatusPanel(
	ctx context.Context,
	cfg config.Config,
	pipeline *compose.Pipeline,
	logger *slog.Logger,
) {
	panel := cfg.StatusPanel
	if !panel.Enabled() || pipeline == nil {
		return
	}
	if logger == nil {
		logger = slog.Default()
	}
	poster := panelPoster{URL: panel.WebhookURL, Client: &http.Client{Timeout: 15 * time.Second}}

	go func() {
		// The URL is a credential and is never logged, so the interval and the
		// state file are what identifies this panel in the log.
		logger.InfoContext(ctx, "The public status panel is on",
			"interval_seconds", int(panel.Interval.Seconds()), "state_path", panel.StatePath)
		syncPanel(ctx, panel, poster, pipeline, time.Now(), logger)

		ticker := time.NewTicker(panel.Interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-ticker.C:
				syncPanel(ctx, panel, poster, pipeline, now, logger)
			}
		}
	}()
}
