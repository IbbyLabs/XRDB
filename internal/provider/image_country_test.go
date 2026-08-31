package provider

import (
	"encoding/json"
	"testing"
)

// The country arrives on the same images response the artwork already comes
// from. Nothing selects on it yet, so the only thing to hold is that it is
// decoded and can be read back for the image actually chosen.
func TestImageCountryIsDecodedAndFound(t *testing.T) {
	var images []tmdbImage
	body := `[
		{"file_path":"/es-es.jpg","iso_639_1":"es","iso_3166_1":"ES"},
		{"file_path":"/es-mx.jpg","iso_639_1":"es","iso_3166_1":"MX"},
		{"file_path":"/textless.jpg","iso_639_1":null,"iso_3166_1":null}
	]`
	if err := json.Unmarshal([]byte(body), &images); err != nil {
		t.Fatalf("decoding the images: %v", err)
	}

	for _, tc := range []struct {
		path string
		want string
	}{
		{"/es-es.jpg", "ES"},
		{"/es-mx.jpg", "MX"},
		// Textless art carries neither tag, so empty is the ordinary answer.
		{"/textless.jpg", ""},
		// A path that is not in the set: empty rather than a wrong country.
		{"/absent.jpg", ""},
	} {
		if got := countryOfPath(images, tc.path); got != tc.want {
			t.Errorf("countryOfPath(%q) = %q, want %q", tc.path, got, tc.want)
		}
	}

	// The control for the two empties above: the field is populated at all, so
	// an empty answer means no country rather than no decoding.
	if images[0].Iso3166 == nil || *images[0].Iso3166 != "ES" {
		t.Fatal("iso_3166_1 did not decode, so the empty answers prove nothing")
	}
}
