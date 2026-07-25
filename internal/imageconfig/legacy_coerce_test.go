package imageconfig

import (
	"encoding/json"
	"testing"
)

// v2 stored its whole config as URL query parameters, so every value arrives as
// a string. Left uncoerced they parse as nothing and the profile silently falls
// back to a default the user never chose.
func TestCoerceLegacyValue(t *testing.T) {
	for _, tc := range []struct {
		name, key, in, want string
		ok                  bool
	}{
		{"comma list", "ratings", `"imdb,tomatoes,tmdb"`, `["imdb","tomatoes","tmdb"]`, true},
		{"list with spaces", "ratings", `"imdb, tmdb"`, `["imdb","tmdb"]`, true},
		{"trailing comma", "ratings", `"imdb,"`, `["imdb"]`, true},
		{"single item", "ratings", `"imdb"`, `["imdb"]`, true},
		{"badges list", "badges", `"4k,hdr"`, `["4k","hdr"]`, true},
		{"int", "ratingBadgeScale", `"200"`, `200`, true},
		{"capped int", "ratingsMax", `"3"`, `3`, true},
		{"bool true", "bottomRatingsRow", `"true"`, `true`, true},
		{"bool word", "bottomRatingsRow", `"on"`, `true`, true},
		{"bool false", "bottomRatingsRow", `"off"`, `false`, true},

		// A present-but-empty list is a v2 user having turned every item off, so
		// it carries as an empty selection rather than reverting to a default.
		{"empty list", "ratings", `""`, `[]`, true},
		{"list of blanks", "ratings", `" , "`, `[]`, true},

		// Left alone rather than guessed at.
		{"already an array", "ratings", `["imdb"]`, "", false},
		{"already a number", "ratingBadgeScale", `200`, "", false},
		{"unparseable int", "ratingBadgeScale", `"huge"`, "", false},
		{"unknown key", "notAThing", `"x"`, "", false},
		{"string stays a string", "language", `"en"`, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := CoerceLegacyValue(tc.key, json.RawMessage(tc.in))
			if ok != tc.ok {
				t.Fatalf("ok = %v, want %v (got %s)", ok, tc.ok, got)
			}
			if ok && string(got) != tc.want {
				t.Errorf("got %s, want %s", got, tc.want)
			}
		})
	}
}

// The coercion table is derived from the parser's own struct, so a value it
// produces must survive a real Parse.
func TestCoercedValuesSurviveParse(t *testing.T) {
	coerced, ok := CoerceLegacyValue("ratings", json.RawMessage(`"imdb,tmdb"`))
	if !ok {
		t.Fatal("expected the list to coerce")
	}
	cfg := Parse(json.RawMessage(`{"ratings":` + string(coerced) + `}`))
	if len(cfg.Ratings) != 2 || cfg.Ratings[0] != "imdb" {
		t.Errorf("Parse read %v, want [imdb tmdb]", cfg.Ratings)
	}
}
