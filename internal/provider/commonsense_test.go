package provider

import (
	"encoding/json"
	"testing"
)

func TestCommonSenseAgeReadsEitherShape(t *testing.T) {
	cases := []struct {
		name string
		body string
		want string
	}{
		{"top level", `{"age_rating":9}`, "9+"},
		{"nested object", `{"commonsense_media":{"common_sense":13}}`, "13+"},
		{"top level wins", `{"age_rating":9,"commonsense_media":{"common_sense":13}}`, "9+"},
		{"absent", `{"score":70}`, ""},
		{"zero is not an age", `{"age_rating":0}`, ""},
		// A value past the top of the scale is a field XRDB has misread rather
		// than an age, so it is left alone.
		{"out of range", `{"age_rating":99}`, ""},
	}
	for _, c := range cases {
		var p mdblistPayload
		if err := json.Unmarshal([]byte(c.body), &p); err != nil {
			t.Fatalf("%s: %v", c.name, err)
		}
		if got := commonSenseAge(p); got != c.want {
			t.Errorf("%s: got %q, want %q", c.name, got, c.want)
		}
	}
}
