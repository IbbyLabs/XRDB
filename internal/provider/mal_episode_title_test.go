package provider

import (
	"errors"
	"fmt"
	"strings"
	"testing"

	"xrdb_rewrite/internal/provider/animemap"
)

func TestTitlesMatch(t *testing.T) {
	tests := []struct {
		name, a, b string
		want       bool
	}{
		{"exact", "Smoke Signal", "Smoke Signal", true},
		{"case and punctuation", "The Journey's End", "the journeys end!", true},
		{"curly quote", "It’s Not Over", "Its not over", true},
		{"diacritics", "Café Désolé", "cafe desole", true},
		{"leading numbering", "Episode 5: Straight Bet", "Straight Bet", true},
		{"jaccard pass", "The Town Where Everything Began", "Town Where Everything Began Again", true},
		{"jaccard fail", "Each One's Promise", "The Next Location", false},
		{"one contains the other with three words", "Straight Bet", "The Straight Bet of the Century", false},
		{"contains with enough words", "Night of the Battle to Retake the Wall", "Night of the Battle", true},
		{"two-word containment is not enough", "Smoke Signal", "Smoke Signal Part 2 Special", false},
		{"empty", "", "Anything", false},
		{"unrelated", "Theatrical Malice", "Straight Bet", false},
	}
	for _, tt := range tests {
		if got := titlesMatch(tt.a, tt.b); got != tt.want {
			t.Errorf("%s: titlesMatch(%q, %q) = %v, want %v", tt.name, tt.a, tt.b, got, tt.want)
		}
	}
}

func TestGenericTitle(t *testing.T) {
	for in, want := range map[string]bool{
		"": true, "  ": true, "Episode 4": true, "episode 12 - x": true, "Ep. 3": true, "ep3": true, "第5話": true,
		"Smoke Signal": false, "Episodes of Fate": false,
	} {
		if got := genericTitle(in); got != want {
			t.Errorf("genericTitle(%q) = %v, want %v", in, got, want)
		}
	}
}

// titledStub serves episode lists whose titles are "Title <n>" per entry.
func titledStub(t *testing.T, totals map[int]int) *MAL {
	_, mal := newJikanStub(t, func(id, page int) string {
		n := totals[id]
		var rows []string
		for i := 1; i <= n; i++ {
			rows = append(rows, fmt.Sprintf(`{"mal_id":%d,"title":"Entry %d Title %d","title_romanji":"Romaji %d","aired":%q,"score":4.5}`, i, id, i, i, settled))
		}
		return fmt.Sprintf(`{"pagination":{"items":{"total":%d}},"data":[%s]}`, n, strings.Join(rows, ","))
	})
	return mal
}

func TestMALEpisodeTitleDecidesTheMapping(t *testing.T) {
	// The chain here is broken (prev ends at 10, entry starts at 12), so only
	// the titles can accept it.
	late := animemap.EpisodeEntry{MALID: 2, Episode: 1, Offset: 12, HasPrev: true, PrevMALID: 1, PrevOffset: 0}
	mapper := fakeEpisodeMapper{"tt1/1/13": late}
	totals := map[int]int{1: 10, 2: 10}

	t.Run("a matching title accepts a chain that does not add up", func(t *testing.T) {
		m := NewMALEpisodes(titledStub(t, totals), mapper)
		ctx := WithEpisodeName(interactive(), "Entry 2 Title 1")
		if _, err := m.FetchEpisodeRating(ctx, "tt1", 1, 13, ""); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("the romanji title also counts", func(t *testing.T) {
		m := NewMALEpisodes(titledStub(t, totals), mapper)
		ctx := WithEpisodeName(interactive(), "Romaji 1")
		if _, err := m.FetchEpisodeRating(ctx, "tt1", 1, 13, ""); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("a clear mismatch is refused even when the chain adds up", func(t *testing.T) {
		good := animemap.EpisodeEntry{MALID: 2, Episode: 1, Offset: 10, HasPrev: true, PrevMALID: 1, PrevOffset: 0}
		m := NewMALEpisodes(titledStub(t, totals), fakeEpisodeMapper{"tt1/1/11": good})
		ctx := WithEpisodeName(interactive(), "Something Else Entirely")
		if _, err := m.FetchEpisodeRating(ctx, "tt1", 1, 11, ""); !errors.Is(err, errNotFound) {
			t.Errorf("err = %v, want a refusal", err)
		}
	})
	t.Run("a generic TMDB name falls back to the chain, which refuses here", func(t *testing.T) {
		m := NewMALEpisodes(titledStub(t, totals), mapper)
		ctx := WithEpisodeName(interactive(), "Episode 13")
		if _, err := m.FetchEpisodeRating(ctx, "tt1", 1, 13, ""); !errors.Is(err, errNotFound) {
			t.Errorf("err = %v, want a refusal", err)
		}
	})
	t.Run("a generic TMDB name falls back to the chain, which accepts here", func(t *testing.T) {
		good := animemap.EpisodeEntry{MALID: 2, Episode: 1, Offset: 10, HasPrev: true, PrevMALID: 1, PrevOffset: 0}
		m := NewMALEpisodes(titledStub(t, totals), fakeEpisodeMapper{"tt1/1/11": good})
		ctx := WithEpisodeName(interactive(), "")
		if _, err := m.FetchEpisodeRating(ctx, "tt1", 1, 11, ""); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("a hinted entry skips the title check", func(t *testing.T) {
		m := NewMALEpisodes(titledStub(t, totals), fakeEpisodeMapper{})
		ctx := WithEpisodeName(WithAnimeEpisodeHint(interactive(), AnimeEpisodeHint{MALID: 2, Episode: 3}), "Unrelated")
		if _, err := m.FetchEpisodeRating(ctx, "tt1", 1, 99, ""); err != nil {
			t.Fatal(err)
		}
	})
}
