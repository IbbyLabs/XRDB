package imageconfig

import "testing"

func TestClampSizeTakesTheCheaperTier(t *testing.T) {
	cases := []struct{ size, max, want MediaSize }{
		{Size4K, SizeSmall, SizeSmall},
		{Size4K, SizeLarge, SizeLarge},
		{SizeSmall, Size4K, SizeSmall},
		{SizeLarge, SizeLarge, SizeLarge},
		{Size4K, "", Size4K},
		{"", SizeSmall, SizeSmall},
	}
	for _, c := range cases {
		if got := ClampSize(c.size, c.max); got != c.want {
			t.Errorf("ClampSize(%q,%q) = %q, want %q", c.size, c.max, got, c.want)
		}
	}
}
