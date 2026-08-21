package compose

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/provider"
)

// "no artwork URL in metadata" was returned whether or not there was a URL: a
// metadata response with no poster and a poster URL that failed to fetch left
// the same sentence in the log, which sends a reader to the provider's response
// when the fault is in the request that followed it.
func TestTheArtworkErrorNamesWhichStepFailed(t *testing.T) {
	refuse := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "gone", http.StatusNotFound)
	}))
	defer refuse.Close()

	t.Run("a metadata response with no poster says so", func(t *testing.T) {
		reg := provider.NewRegistry()
		reg.Register(&provider.StubProvider{
			ProviderName: "tmdb",
			Meta:         &provider.MediaMeta{Title: "T"},
		})
		_, _, _, _, _, err := New(reg).fetchSourceImageAndMeta(context.Background(), Request{
			MediaType: "poster", MediaID: "tt0111161", Config: imageconfig.Default(),
		})
		if err == nil {
			t.Fatal("metadata with no poster reported success")
		}
		if !strings.Contains(err.Error(), "no artwork URL in metadata") {
			t.Errorf("got %q, want the missing-URL cause", err)
		}
	})

	t.Run("a poster URL that will not fetch names the fetch", func(t *testing.T) {
		reg := provider.NewRegistry()
		reg.Register(&provider.StubProvider{
			ProviderName: "tmdb",
			Meta:         &provider.MediaMeta{Title: "T", PosterURL: refuse.URL + "/poster.jpg"},
		})
		_, _, _, _, _, err := New(reg).fetchSourceImageAndMeta(context.Background(), Request{
			MediaType: "poster", MediaID: "tt0111161", Config: imageconfig.Default(),
		})
		if err == nil {
			t.Fatal("an unfetchable poster reported success")
		}
		if strings.Contains(err.Error(), "no artwork URL in metadata") {
			t.Errorf("a fetch failure was reported as a missing URL: %q", err)
		}
		if !strings.Contains(err.Error(), "artwork fetch") {
			t.Errorf("got %q, want the fetch named", err)
		}
	})
}
