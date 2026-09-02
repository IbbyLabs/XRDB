package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func tmdbFindStub(t *testing.T, body string) *TMDB {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Path, "/find/") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	tm := NewTMDB("key", "")
	tm.httpClient = srv.Client()
	tm.baseURL = srv.URL
	return tm
}

// Every source XRDB asks indexes shows and none indexes episodes, so an episode
// id failed everywhere at once. TMDB does know it, on a result set the decode
// had no field for (BUG-279).
func TestAnEpisodeIdResolvesToItsSeries(t *testing.T) {
	body := `{"movie_results":[],"tv_results":[],"tv_episode_results":[
	  {"id":1021925,"name":"Eileen Flat Screen","show_id":31132,"season_number":6,"episode_number":7}
	],"tv_season_results":[],"person_results":[]}`

	got, ok, err := tmdbFindStub(t, body).findByExternalID(context.Background(), "tt4164090", "imdb_id", "")
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("an episode id resolved to nothing")
	}
	if got.ID != "31132" || got.ContentType != "tv" {
		t.Errorf("got %+v, want the series 31132", got)
	}
}

// The control: a response with nothing in it at all still resolves to nothing,
// so the episode branch is not turning every miss into a match.
func TestAnUnknownIdStillResolvesToNothing(t *testing.T) {
	body := `{"movie_results":[],"tv_results":[],"tv_episode_results":[],"tv_season_results":[]}`

	_, ok, err := tmdbFindStub(t, body).findByExternalID(context.Background(), "tt0000000", "imdb_id", "")
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Error("an id TMDB does not know resolved to something")
	}
}

// A show that answers directly is unaffected: the episode branch only runs when
// neither list holds anything.
func TestASeriesIdIsUnaffectedByTheEpisodeBranch(t *testing.T) {
	body := `{"movie_results":[],"tv_results":[{"id":1396,"name":"Breaking Bad","popularity":90}],
	  "tv_episode_results":[{"show_id":999,"season_number":1,"episode_number":1}]}`

	got, ok, err := tmdbFindStub(t, body).findByExternalID(context.Background(), "tt0903747", "imdb_id", "")
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if got.ID != "1396" {
		t.Errorf("got %+v, want the show TMDB named directly rather than the episode's parent", got)
	}
}

// An entry with no show id is not a resolution.
func TestAnEpisodeWithNoShowIdResolvesToNothing(t *testing.T) {
	body := `{"movie_results":[],"tv_results":[],"tv_episode_results":[{"id":5,"show_id":0}]}`

	if _, ok, _ := tmdbFindStub(t, body).findByExternalID(context.Background(), "tt1", "imdb_id", ""); ok {
		t.Error("an episode with no show id resolved to something")
	}
}

// The /find response that resolves a tt-id already names the episode. Dropping
// the two numbers is what made an episode render as its series: the episode
// path needs them and nothing else supplies them.
func TestFindCarriesTheEpisodeNumbersNotJustTheShow(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"movie_results":[],"tv_results":[],
		  "tv_episode_results":[{"show_id":31132,"season_number":6,"episode_number":7}]}`))
	}))
	t.Cleanup(srv.Close)
	tmdb := &TMDB{httpClient: srv.Client(), baseURL: srv.URL, apiKey: "k"}

	series, season, episode, ok, err := tmdb.IdentifyEpisode(context.Background(), "tt4164090")
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatal("an episode id was not recognised as one")
	}
	if series != "31132" || season != 6 || episode != 7 {
		t.Errorf("got series %q s%d e%d, want 31132 s6 e7", series, season, episode)
	}
}

// A film's id names no episode, and saying it does would send every film down
// the episode path.
func TestFindDoesNotCallAFilmAnEpisode(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"movie_results":[{"id":603,"title":"The Matrix"}],
		  "tv_results":[],"tv_episode_results":[]}`))
	}))
	t.Cleanup(srv.Close)
	tmdb := &TMDB{httpClient: srv.Client(), baseURL: srv.URL, apiKey: "k"}

	if _, _, _, ok, err := tmdb.IdentifyEpisode(context.Background(), "tt0133093"); err != nil || ok {
		t.Errorf("IdentifyEpisode said ok=%v err=%v for a film", ok, err)
	}
}

// A special is season 0, so a zero season is a value rather than an absence.
func TestFindKeepsASeasonZeroSpecial(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"movie_results":[],"tv_results":[],
		  "tv_episode_results":[{"show_id":1399,"season_number":0,"episode_number":2}]}`))
	}))
	t.Cleanup(srv.Close)
	tmdb := &TMDB{httpClient: srv.Client(), baseURL: srv.URL, apiKey: "k"}

	series, season, episode, ok, err := tmdb.IdentifyEpisode(context.Background(), "tt9999999")
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if series != "1399" || season != 0 || episode != 2 {
		t.Errorf("got series %q s%d e%d, want 1399 s0 e2", series, season, episode)
	}
}
