package provider

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider/animemap"
)

type fakeEpisodeMapper map[string]animemap.EpisodeEntry

func (f fakeEpisodeMapper) EpisodeEntry(key string, season, episode int) (animemap.EpisodeEntry, animemap.EpisodeRefusal) {
	if e, ok := f[fmt.Sprintf("%s/%d/%d", key, season, episode)]; ok {
		return e, animemap.EpisodeResolved
	}
	return animemap.EpisodeEntry{}, animemap.EpisodeNoRows
}

type jikanStub struct {
	mu    sync.Mutex
	paths []string
	body  func(malID, page int) string
}

func (j *jikanStub) requests() []string {
	j.mu.Lock()
	defer j.mu.Unlock()
	return append([]string(nil), j.paths...)
}

func newJikanStub(t *testing.T, body func(malID, page int) string) (*jikanStub, *MAL) {
	t.Helper()
	stub := &jikanStub{body: body}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		stub.mu.Lock()
		stub.paths = append(stub.paths, r.URL.RequestURI())
		stub.mu.Unlock()
		var malID, page int
		if _, err := fmt.Sscanf(r.URL.Path, "/v4/anime/%d/episodes", &malID); err != nil {
			http.NotFound(w, r)
			return
		}
		_, _ = fmt.Sscanf(r.URL.Query().Get("page"), "%d", &page)
		_, _ = w.Write([]byte(stub.body(malID, page)))
	}))
	t.Cleanup(srv.Close)
	return stub, &MAL{httpClient: srv.Client(), baseURL: srv.URL + "/v4/anime/"}
}

func jikanPage(first, count int, aired string, score string) string {
	var rows []string
	for i := 0; i < count; i++ {
		rows = append(rows, fmt.Sprintf(`{"mal_id":%d,"aired":%q,"score":%s}`, first+i, aired, score))
	}
	return `{"pagination":{"has_next_page":false},"data":[` + strings.Join(rows, ",") + `]}`
}

const settled = "2019-07-07T00:00:00+00:00"

func interactive() context.Context {
	return WithCallerClass(context.Background(), CallerInteractive)
}

func TestMALEpisodeScoreIsOnTheTenPointScaleWithItsNativeLabel(t *testing.T) {
	_, mal := newJikanStub(t, func(int, int) string { return jikanPage(1, 10, settled, "4.73") })
	m := NewMALEpisodes(mal, fakeEpisodeMapper{"tt1/3/13": {MALID: 38524, Episode: 1}})
	meta, err := m.FetchEpisodeRating(interactive(), "tt1", 3, 13, "")
	if err != nil {
		t.Fatal(err)
	}
	r := meta.Ratings[0]
	if r.Source != "malep" || r.Label != "4.73" || r.NativeSuffix != "/5" || r.Votes != 0 {
		t.Errorf("rating = %+v", r)
	}
	if r.Value < 9.45 || r.Value > 9.47 {
		t.Errorf("value = %v, want 9.46", r.Value)
	}
}

func TestMALEpisodeFetchesOnlyThePageHoldingTheEpisode(t *testing.T) {
	stub, mal := newJikanStub(t, func(id, page int) string {
		return jikanPage((page-1)*100+1, 100, settled, "4.00")
	})
	m := NewMALEpisodes(mal, fakeEpisodeMapper{"tt1/1/150": {MALID: 21, Episode: 150}, "tt1/1/100": {MALID: 21, Episode: 100}})
	if _, err := m.FetchEpisodeRating(interactive(), "tt1", 1, 150, ""); err != nil {
		t.Fatal(err)
	}
	got := stub.requests()
	if len(got) != 1 || got[0] != "/v4/anime/21/episodes?page=2" {
		t.Errorf("requests = %v, want only page 2", got)
	}
	if _, err := m.FetchEpisodeRating(interactive(), "tt1", 1, 100, ""); err != nil {
		t.Fatal(err)
	}
	if got := stub.requests(); len(got) != 2 || got[1] != "/v4/anime/21/episodes?page=1" {
		t.Errorf("requests = %v, want episode 100 on page 1", got)
	}
}

func TestMALEpisodePastTheEntryIsNotRated(t *testing.T) {
	_, mal := newJikanStub(t, func(int, int) string { return jikanPage(1, 12, settled, "4.00") })
	m := NewMALEpisodes(mal, fakeEpisodeMapper{"tt1/1/13": {MALID: 5, Episode: 13}})
	_, err := m.FetchEpisodeRating(interactive(), "tt1", 1, 13, "")
	if !errors.Is(err, errNotFound) {
		t.Errorf("err = %v, want a not-found", err)
	}
}

func TestMALEpisodeWithoutAScoreIsNotRated(t *testing.T) {
	_, mal := newJikanStub(t, func(int, int) string { return jikanPage(1, 3, settled, "null") })
	m := NewMALEpisodes(mal, fakeEpisodeMapper{"tt1/1/2": {MALID: 5, Episode: 2}})
	if _, err := m.FetchEpisodeRating(interactive(), "tt1", 1, 2, ""); !errors.Is(err, errNotFound) {
		t.Errorf("err = %v, want a not-found", err)
	}
}

func TestMALEpisodePageIsCachedAndSharedInFlight(t *testing.T) {
	var gate = make(chan struct{})
	stub, mal := newJikanStub(t, func(int, int) string {
		<-gate
		return jikanPage(1, 30, settled, "4.20")
	})
	m := NewMALEpisodes(mal, fakeEpisodeMapper{
		"tt1/1/1": {MALID: 9, Episode: 1}, "tt1/1/2": {MALID: 9, Episode: 2},
	})
	var wg sync.WaitGroup
	var failures atomic.Int32
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(ep int) {
			defer wg.Done()
			if _, err := m.FetchEpisodeRating(interactive(), "tt1", 1, ep, ""); err != nil {
				failures.Add(1)
			}
		}(i%2 + 1)
	}
	time.Sleep(100 * time.Millisecond)
	close(gate)
	wg.Wait()
	if failures.Load() != 0 {
		t.Fatalf("%d fetches failed", failures.Load())
	}
	if n := len(stub.requests()); n != 1 {
		t.Errorf("%d upstream requests for one page, want 1", n)
	}
	if _, err := m.FetchEpisodeRating(interactive(), "tt1", 1, 2, ""); err != nil {
		t.Fatal(err)
	}
	if n := len(stub.requests()); n != 1 {
		t.Errorf("a cached page went upstream again: %d requests", n)
	}
}

func TestMALEpisodeBulkCallersReadOnlyTheCache(t *testing.T) {
	stub, mal := newJikanStub(t, func(int, int) string { return jikanPage(1, 10, settled, "4.00") })
	m := NewMALEpisodes(mal, fakeEpisodeMapper{"tt1/1/1": {MALID: 9, Episode: 1}})
	bulk := WithCallerClass(context.Background(), CallerBulk)

	_, err := m.FetchEpisodeRating(bulk, "tt1", 1, 1, "")
	if !errors.Is(err, ErrBulkAllowanceHeld) {
		t.Fatalf("err = %v, want the bulk hold", err)
	}
	if n := len(stub.requests()); n != 0 {
		t.Fatalf("a bulk caller reached Jikan: %d requests", n)
	}
	if _, err := m.FetchEpisodeRating(interactive(), "tt1", 1, 1, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := m.FetchEpisodeRating(bulk, "tt1", 1, 1, ""); err != nil {
		t.Errorf("a bulk caller could not read a cached page: %v", err)
	}
	if n := len(stub.requests()); n != 1 {
		t.Errorf("%d requests, want the one interactive fetch", n)
	}
}

func TestMALEpisodeCacheKeyIsPerEntryAndPage(t *testing.T) {
	stub, mal := newJikanStub(t, func(int, int) string { return jikanPage(1, 10, settled, "4.00") })
	m := NewMALEpisodes(mal, fakeEpisodeMapper{
		"tt1/3/1":  {MALID: 35760, Episode: 1},
		"tt1/3/13": {MALID: 38524, Episode: 1},
	})
	for _, ep := range []int{1, 13} {
		if _, err := m.FetchEpisodeRating(interactive(), "tt1", 3, ep, ""); err != nil {
			t.Fatal(err)
		}
	}
	got := stub.requests()
	if len(got) != 2 || !strings.Contains(got[0], "/35760/") || !strings.Contains(got[1], "/38524/") {
		t.Errorf("requests = %v, want one page per entry", got)
	}
}

func TestMALEpisodePageTerm(t *testing.T) {
	now := time.Date(2026, 10, 14, 0, 0, 0, 0, time.UTC)
	score := 4.0
	ago := func(d time.Duration) string { return now.Add(-d).Format(time.RFC3339) }
	day := 24 * time.Hour
	tests := []struct {
		name string
		eps  []jikanEpisode
		want time.Duration
	}{
		{"an episode aired last week", []jikanEpisode{{Aired: ago(7 * day), Score: &score}}, malEpisodesFresh},
		{"a recent episode with no score", []jikanEpisode{{Aired: ago(30 * day)}}, malEpisodesFresh},
		{"an old episode with no score", []jikanEpisode{{Aired: ago(400 * day)}}, malEpisodesSettled},
		{"all settled and scored", []jikanEpisode{{Aired: ago(400 * day), Score: &score}}, malEpisodesSettled},
		{"an episode yet to air", []jikanEpisode{{Aired: now.Add(5 * day).Format(time.RFC3339)}}, malEpisodesFresh},
	}
	for _, tt := range tests {
		if got := malPageTerm(tt.eps, now); got != tt.want {
			t.Errorf("%s: term = %v, want %v", tt.name, got, tt.want)
		}
	}
}

func TestMALEpisodeAnimeIDHintWinsOverTheMapper(t *testing.T) {
	stub, mal := newJikanStub(t, func(int, int) string { return jikanPage(1, 10, settled, "4.00") })
	m := NewMALEpisodes(mal, fakeEpisodeMapper{})
	ctx := WithAnimeEpisodeHint(interactive(), AnimeEpisodeHint{MALID: 38524, Episode: 4})
	if !m.AppliesTo(ctx, "series", "tt1:3:16") {
		t.Fatal("an episode named by MAL id should apply without a mapping")
	}
	if _, err := m.FetchEpisodeRating(ctx, "tt1", 3, 16, ""); err != nil {
		t.Fatal(err)
	}
	if got := stub.requests(); len(got) != 1 || !strings.Contains(got[0], "/38524/") {
		t.Errorf("requests = %v", got)
	}
}

func TestMALEpisodeAppliesOnlyToMappedEpisodes(t *testing.T) {
	_, mal := newJikanStub(t, func(int, int) string { return "{}" })
	m := NewMALEpisodes(mal, fakeEpisodeMapper{"tt1/3/13": {MALID: 38524, Episode: 1}, "tv:1429/3/13": {MALID: 38524, Episode: 1}})
	tests := []struct {
		id   string
		want bool
	}{
		{"tt1:3:13", true},
		{"tmdb:series:1429:3:13", true},
		{"tmdb:1429:3:13", true},
		{"tt1:3:14", false},
		{"tt1", false},
		{"tvdb:81797:3:13", false},
		{"tt1:0:13", false},
	}
	for _, tt := range tests {
		if got := m.AppliesTo(context.Background(), "series", tt.id); got != tt.want {
			t.Errorf("AppliesTo(%q) = %v, want %v", tt.id, got, tt.want)
		}
	}
}

func TestMALEpisodeSharesTheMALClient(t *testing.T) {
	mal := NewMALWithURL("")
	m := NewMALEpisodes(mal, nil)
	if m.mal.httpClient != mal.httpClient {
		t.Error("the episode source has its own HTTP client, so it has its own pacer")
	}
}

func TestMALEpisodeUpstreamFaults(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/404/") {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusGatewayTimeout)
		_, _ = w.Write([]byte(`{"type":"BadResponseException"}`))
	}))
	defer srv.Close()
	mal := &MAL{httpClient: srv.Client(), baseURL: srv.URL + "/v4/anime/"}
	m := NewMALEpisodes(mal, fakeEpisodeMapper{"tt1/1/1": {MALID: 404, Episode: 1}, "tt1/1/2": {MALID: 5, Episode: 1}})
	if _, err := m.FetchEpisodeRating(interactive(), "tt1", 1, 1, ""); !errors.Is(err, errNotFound) {
		t.Errorf("404: err = %v", err)
	}
	if _, err := m.FetchEpisodeRating(interactive(), "tt1", 1, 2, ""); !errors.Is(err, ErrUpstreamUnavailable) {
		t.Errorf("per-title 504: err = %v", err)
	}
}

func jikanPageTotal(first, count, total int) string {
	body := jikanPage(first, count, settled, "4.00")
	return strings.Replace(body, `"pagination":{`, fmt.Sprintf(`"pagination":{"items":{"total":%d},`, total), 1)
}

// totals maps an entry to the episode count Jikan reports for it.
func chainStub(t *testing.T, totals map[int]int) (*jikanStub, *MAL) {
	return newJikanStub(t, func(id, page int) string {
		n := totals[id]
		if n > 100 {
			n = 100
		}
		return jikanPageTotal((page-1)*100+1, n, totals[id])
	})
}

func TestMALEpisodeChainMustLineUp(t *testing.T) {
	prev := animemap.EpisodeEntry{MALID: 39587, Episode: 1, Offset: 38, HasPrev: true, PrevMALID: 31240, PrevOffset: 26}
	mapper := func(prevTotal int) (fakeEpisodeMapper, map[int]int) {
		return fakeEpisodeMapper{"tt1/1/39": prev}, map[int]int{39587: 12, 31240: prevTotal}
	}
	t.Run("a chain that adds up is scored", func(t *testing.T) {
		mp, totals := mapper(12)
		_, mal := chainStub(t, totals)
		if _, err := NewMALEpisodes(mal, mp).FetchEpisodeRating(interactive(), "tt1", 1, 39, ""); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("a chain off by one is refused", func(t *testing.T) {
		mp, totals := mapper(13)
		_, mal := chainStub(t, totals)
		if _, err := NewMALEpisodes(mal, mp).FetchEpisodeRating(interactive(), "tt1", 1, 39, ""); !errors.Is(err, errNotFound) {
			t.Errorf("err = %v, want a refusal", err)
		}
	})
	t.Run("a previous entry with no reported total is refused", func(t *testing.T) {
		mp, totals := mapper(0)
		_, mal := chainStub(t, totals)
		if _, err := NewMALEpisodes(mal, mp).FetchEpisodeRating(interactive(), "tt1", 1, 39, ""); !errors.Is(err, errNotFound) {
			t.Errorf("err = %v, want a refusal", err)
		}
	})
	t.Run("a late entry with nothing before it is refused", func(t *testing.T) {
		_, mal := chainStub(t, map[int]int{7: 12})
		mp := fakeEpisodeMapper{"tt1/1/13": {MALID: 7, Episode: 1, Offset: 12}}
		if _, err := NewMALEpisodes(mal, mp).FetchEpisodeRating(interactive(), "tt1", 1, 13, ""); !errors.Is(err, errNotFound) {
			t.Errorf("err = %v, want a refusal", err)
		}
	})
	t.Run("the first entry needs no check and costs one request", func(t *testing.T) {
		stub, mal := chainStub(t, map[int]int{7: 12})
		mp := fakeEpisodeMapper{"tt1/1/2": {MALID: 7, Episode: 2}}
		if _, err := NewMALEpisodes(mal, mp).FetchEpisodeRating(interactive(), "tt1", 1, 2, ""); err != nil {
			t.Fatal(err)
		}
		if n := len(stub.requests()); n != 1 {
			t.Errorf("%d requests, want 1", n)
		}
	})
	t.Run("an episode past the reported total is refused", func(t *testing.T) {
		_, mal := chainStub(t, map[int]int{7: 10})
		mp := fakeEpisodeMapper{"tt1/1/11": {MALID: 7, Episode: 11}}
		// The page lists 10 rows, so only the total could have caught an
		// entry whose list is padded.
		m := NewMALEpisodes(mal, mp)
		if _, err := m.FetchEpisodeRating(interactive(), "tt1", 1, 11, ""); !errors.Is(err, errNotFound) {
			t.Errorf("err = %v, want a refusal", err)
		}
	})
	t.Run("a hinted entry skips the chain", func(t *testing.T) {
		stub, mal := chainStub(t, map[int]int{7: 12})
		ctx := WithAnimeEpisodeHint(interactive(), AnimeEpisodeHint{MALID: 7, Episode: 3})
		if _, err := NewMALEpisodes(mal, fakeEpisodeMapper{}).FetchEpisodeRating(ctx, "tt1", 1, 40, ""); err != nil {
			t.Fatal(err)
		}
		if n := len(stub.requests()); n != 1 {
			t.Errorf("%d requests, want 1", n)
		}
	})
	t.Run("a bulk caller with the chain uncached gets no score", func(t *testing.T) {
		mp, totals := mapper(12)
		stub, mal := chainStub(t, totals)
		bulk := WithCallerClass(context.Background(), CallerBulk)
		if _, err := NewMALEpisodes(mal, mp).FetchEpisodeRating(bulk, "tt1", 1, 39, ""); !errors.Is(err, ErrBulkAllowanceHeld) {
			t.Errorf("err = %v, want the bulk hold", err)
		}
		if n := len(stub.requests()); n != 0 {
			t.Errorf("%d requests from a bulk caller", n)
		}
	})
}
