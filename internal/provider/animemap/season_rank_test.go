package animemap

import "testing"

// Five rows in the Fribb dataset carry Gurren Lagann's IMDb id: the TV series at
// season 1, and four specials and OVAs at season 0. Ranking season 0 as "no
// season info, so it wins" handed the OVA's score to the series.
func TestATVSeriesBeatsTheSpecialsSharingItsIMDbID(t *testing.T) {
	data := []byte(`[
	  {"type":"TV","mal_id":2001,"anilist_id":2001,"kitsu_id":1801,
	   "imdb_id":["tt0948103"],"themoviedb_id":{"tv":21729},"season":{"tvdb":1,"tmdb":1}},
	  {"type":"SPECIAL","mal_id":4705,"imdb_id":["tt0948103"],
	   "themoviedb_id":{"tv":21729},"season":{"tvdb":0,"tmdb":0}},
	  {"type":"OVA","mal_id":10622,"imdb_id":["tt0948103"],
	   "themoviedb_id":{"tv":21729},"season":{"tvdb":0,"tmdb":0}}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	got, ok := idx.imdb["tt0948103"]
	if !ok {
		t.Fatal("the IMDb id resolved to nothing")
	}
	if got.ids.MAL != 2001 {
		t.Errorf("MAL id = %d, want 2001 (the TV series)", got.ids.MAL)
	}
}

// File order must not decide it either: the series is listed last here.
func TestTheSeriesWinsWhateverOrderTheRowsAreIn(t *testing.T) {
	data := []byte(`[
	  {"type":"OVA","mal_id":10622,"imdb_id":["tt0948103"],"season":{"tvdb":0,"tmdb":0}},
	  {"type":"SPECIAL","mal_id":4705,"imdb_id":["tt0948103"],"season":{"tvdb":0,"tmdb":0}},
	  {"type":"TV","mal_id":2001,"imdb_id":["tt0948103"],"season":{"tvdb":1,"tmdb":1}}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	if got := idx.imdb["tt0948103"].ids.MAL; got != 2001 {
		t.Errorf("MAL id = %d, want 2001", got)
	}
}

// A first season still beats a later one, which is what the ranking was for.
func TestAFirstSeasonBeatsALaterOne(t *testing.T) {
	data := []byte(`[
	  {"type":"TV","mal_id":900,"imdb_id":["tt5"],"season":{"tvdb":3,"tmdb":3}},
	  {"type":"TV","mal_id":100,"imdb_id":["tt5"],"season":{"tvdb":1,"tmdb":1}}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	if got := idx.imdb["tt5"].ids.MAL; got != 100 {
		t.Errorf("MAL id = %d, want 100 (season 1)", got)
	}
}

// A later season still beats a special, so the three tiers stay ordered.
func TestALaterSeasonBeatsASpecial(t *testing.T) {
	data := []byte(`[
	  {"type":"SPECIAL","mal_id":777,"imdb_id":["tt6"],"season":{"tvdb":0,"tmdb":0}},
	  {"type":"TV","mal_id":222,"imdb_id":["tt6"],"season":{"tvdb":2,"tmdb":2}}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	if got := idx.imdb["tt6"].ids.MAL; got != 222 {
		t.Errorf("MAL id = %d, want 222 (season 2)", got)
	}
}

// A row with no season at all is a season-less row, not a first season.
func TestAMissingSeasonLosesToARealOne(t *testing.T) {
	data := []byte(`[
	  {"type":"MOVIE","mal_id":555,"imdb_id":["tt7"]},
	  {"type":"TV","mal_id":111,"imdb_id":["tt7"],"season":{"tvdb":1,"tmdb":1}}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	if got := idx.imdb["tt7"].ids.MAL; got != 111 {
		t.Errorf("MAL id = %d, want 111 (the season-1 row)", got)
	}
}

// The reverse index ranks the same way, or a MAL id maps back to the wrong
// mainstream title.
func TestTheReverseIndexPrefersTheSeriesToo(t *testing.T) {
	data := []byte(`[
	  {"type":"SPECIAL","mal_id":4705,"anilist_id":4705,"imdb_id":["tt0948103"],
	   "themoviedb_id":{"tv":99999},"season":{"tvdb":0,"tmdb":0}},
	  {"type":"TV","mal_id":4705,"anilist_id":4705,"imdb_id":["tt0948103"],
	   "themoviedb_id":{"tv":21729},"season":{"tvdb":1,"tmdb":1}}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	tgt, ok := idx.reverse["mal:4705"]
	if !ok {
		t.Fatal("no reverse entry")
	}
	if tgt.Target.TMDB != 21729 {
		t.Errorf("TMDB = %d, want 21729 (the series)", tgt.Target.TMDB)
	}
}

// Type decides before season. A franchise files its extras against the series'
// IMDb id, and a season number only correlates with which row is the series.
func TestATVRowWinsEvenWithoutASeason(t *testing.T) {
	data := []byte(`[
	  {"type":"OVA","mal_id":10622,"imdb_id":["tt8"],"season":{"tvdb":1,"tmdb":1}},
	  {"type":"TV","mal_id":2001,"imdb_id":["tt8"]}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	if got := idx.imdb["tt8"].ids.MAL; got != 2001 {
		t.Errorf("MAL id = %d, want 2001 (the TV row)", got)
	}
}

// Steins;Gate shares its IMDb id with an ONA. The series scores 9.07 and the
// ONA does not, so the wrong row is a visibly wrong number on the poster.
func TestTheSeriesBeatsAnONASharingItsIMDbID(t *testing.T) {
	data := []byte(`[
	  {"type":"ONA","mal_id":27957,"imdb_id":["tt1910272"],"season":{"tvdb":0,"tmdb":0}},
	  {"type":"TV","mal_id":9253,"imdb_id":["tt1910272"],"season":{"tvdb":1,"tmdb":1}}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	if got := idx.imdb["tt1910272"].ids.MAL; got != 9253 {
		t.Errorf("MAL id = %d, want 9253 (the TV series)", got)
	}
}

// Season still orders rows of the same type, so a first season beats a later one.
func TestSeasonBreaksTiesWithinAType(t *testing.T) {
	data := []byte(`[
	  {"type":"TV","mal_id":900,"imdb_id":["tt9"],"season":{"tvdb":3,"tmdb":3}},
	  {"type":"TV","mal_id":100,"imdb_id":["tt9"],"season":{"tvdb":1,"tmdb":1}}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	if got := idx.imdb["tt9"].ids.MAL; got != 100 {
		t.Errorf("MAL id = %d, want 100", got)
	}
}

// An unrecognised or absent type loses to every named one rather than winning
// by accident.
func TestAnUnknownTypeLosesToANamedOne(t *testing.T) {
	for _, unknown := range []string{`"UNKNOWN"`, `""`, `null`} {
		data := []byte(`[
		  {"type":` + unknown + `,"mal_id":999,"imdb_id":["tt10"],"season":{"tvdb":1,"tmdb":1}},
		  {"type":"SPECIAL","mal_id":321,"imdb_id":["tt10"],"season":{"tvdb":0,"tmdb":0}}
		]`)
		idx, err := buildIndexes(data)
		if err != nil {
			t.Fatalf("buildIndexes(%s): %v", unknown, err)
		}
		if got := idx.imdb["tt10"].ids.MAL; got != 321 {
			t.Errorf("type %s: MAL id = %d, want 321 (the SPECIAL)", unknown, got)
		}
	}
}

// A group with no TV row still resolves rather than falling through.
func TestAFilmOnlyGroupStillResolves(t *testing.T) {
	data := []byte(`[
	  {"type":"OVA","mal_id":50,"imdb_id":["tt11"]},
	  {"type":"MOVIE","mal_id":60,"imdb_id":["tt11"]}
	]`)
	idx, err := buildIndexes(data)
	if err != nil {
		t.Fatalf("buildIndexes: %v", err)
	}
	if got := idx.imdb["tt11"].ids.MAL; got != 60 {
		t.Errorf("MAL id = %d, want 60 (the film)", got)
	}
}
