package imageconfig

// sizeRank orders the output tiers from cheapest to most expensive. An unset or
// unrecognised size renders at the normal canvas, so it ranks with normal.
var sizeRank = map[MediaSize]int{
	SizeSmall:  0,
	"":         1,
	SizeNormal: 1,
	SizeLarge:  2,
	Size4K:     3,
}

// ClampSize returns the cheaper of size and max. An empty max caps nothing.
//
// A surface reached through a compatibility route can be capped without editing
// the profile behind it: the route knows what its clients can use, the profile
// does not know which route it was reached through.
func ClampSize(size, max MediaSize) MediaSize {
	if max == "" {
		return size
	}
	if sizeRank[size] <= sizeRank[max] {
		return size
	}
	return max
}

// ParseSize normalises a configured or env-supplied size name, returning "" for
// anything unrecognised.
func ParseSize(v string) MediaSize { return normalizeMediaSize(v) }
