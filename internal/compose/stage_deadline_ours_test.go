package compose

import (
	"bytes"
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// "No source had artwork" and "we stopped waiting" produce the same placeholder
// and must not be remembered the same way: the first is a fact about the title,
// the second is a fact about us and stops being true the moment the source is
// well.
func TestAPlaceholderWeCausedIsMarkedAsOurs(t *testing.T) {
	if testing.Short() {
		t.Skip("times a real deadline")
	}
	hang := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer hang.Close()

	reg := provider.NewRegistry()
	for _, name := range []string{"tmdb", "fanart", "mediux"} {
		reg.Register(&provider.StubProvider{
			ProviderName: name,
			Meta:         &provider.MediaMeta{Title: "T", PosterURL: hang.URL + "/poster.jpg"},
		})
	}
	p := New(reg)
	p.SetArtFetchTimeout(120 * time.Millisecond)

	res, err := p.Render(context.Background(), Request{
		MediaType: "poster", MediaID: "tt0111161", Config: imageconfig.Default(),
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !res.Placeholder {
		t.Fatal("dead sources produced something other than a placeholder")
	}
	if !res.PlaceholderIsOurs {
		t.Error("a placeholder caused by our own deadline is not marked as ours, so it will be remembered")
	}
}

// A title genuinely nobody has artwork for is still worth remembering, or a
// catalogue of it costs one sweep per episode.
func TestAPlaceholderFromEmptySourcesIsNotOurs(t *testing.T) {
	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T"}, // no artwork URL at all
	})
	p := New(reg)

	res, err := p.Render(context.Background(), Request{
		MediaType: "poster", MediaID: "tt0111161", Config: imageconfig.Default(),
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !res.Placeholder {
		t.Fatal("a source with no artwork produced something other than a placeholder")
	}
	if res.PlaceholderIsOurs {
		t.Error("a title no source has artwork for was blamed on our deadline, so it will be re-swept every request")
	}
}

// A caller that gives up is neither case, and must not be recorded as our
// deadline: nothing about the title or about our patience was established.
func TestACallerGivingUpIsNotOurDeadline(t *testing.T) {
	hang := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer hang.Close()

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{
		ProviderName: "tmdb",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: hang.URL + "/poster.jpg"},
	})
	p := New(reg)
	p.SetArtFetchTimeout(10 * time.Second)

	ctx, cancel := context.WithTimeout(context.Background(), 80*time.Millisecond)
	defer cancel()
	res, err := p.Render(ctx, Request{
		MediaType: "poster", MediaID: "tt0111161", Config: imageconfig.Default(),
	})
	if err != nil || res == nil {
		return // an abandoned render need not produce a result at all
	}
	if res.PlaceholderIsOurs {
		t.Error("a caller giving up was recorded as our own deadline")
	}
}

// The placeholder line names what our cut was waiting on, which the configured
// artwork source alone cannot say.
func TestOurCutNamesTheSourceItWasWaitingOn(t *testing.T) {
	if testing.Short() {
		t.Skip("times a real deadline")
	}
	hang := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer hang.Close()

	reg := provider.NewRegistry()
	reg.Register(&provider.StubProvider{ProviderName: "tmdb", Meta: &provider.MediaMeta{Title: "T"}})
	reg.Register(&provider.StubProvider{
		ProviderName: "fanart",
		Meta:         &provider.MediaMeta{Title: "T", PosterURL: hang.URL + "/poster.jpg"},
	})
	p := New(reg)
	p.SetArtFetchTimeout(120 * time.Millisecond)

	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
	defer slog.SetDefault(prev)

	cfg := imageconfig.Default()
	cfg.ArtworkSource = imageconfig.ArtworkTMDB
	if _, err := p.Render(context.Background(), Request{MediaType: "poster", MediaID: "tt0111161", Config: cfg}); err != nil {
		t.Fatalf("Render: %v", err)
	}
	out := buf.String()
	if !strings.Contains(out, "serving a placeholder") {
		t.Fatal("no placeholder line")
	}
	for _, want := range [][2]string{{"waiting_on=fanart", `"waiting_on":"fanart"`}, {"waiting_for=image", `"waiting_for":"image"`}, {"waited_ms=", `"waited_ms":`}, {"caller_class=", `"caller_class":`}} {
		if !strings.Contains(out, want[0]) && !strings.Contains(out, want[1]) {
			t.Errorf("placeholder line lacks %s (the configured source was tmdb): %s", want, out)
		}
	}
}
