package provider

import "testing"

func TestStingerFromKeywords(t *testing.T) {
	cases := []struct {
		names            []string
		mid, post, has bool
	}{
		{[]string{"aftercreditsstinger"}, false, true, true},
		{[]string{"duringcreditsstinger"}, true, false, true},
		{[]string{"duringcreditsstinger", "aftercreditsstinger", "superhero"}, true, true, true},
		{[]string{"superhero", "based on comic"}, false, false, false},
		{nil, false, false, false},
	}
	for _, c := range cases {
		got := stingerFromKeywords(c.names)
		if got.MidCredits != c.mid || got.PostCredits != c.post || got.Has() != c.has {
			t.Errorf("%v -> %+v, want mid=%v post=%v has=%v", c.names, got, c.mid, c.post, c.has)
		}
	}
}
