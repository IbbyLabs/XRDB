package imageconfig

import "testing"

// A large or 4k poster needs more than 200%: at the old cap the provider chips
// and quality tiles still read as small, which is what FR-37 reported. Rating
// badges already allowed 400, so the three now share a range.
func TestBadgeScalesShareTheSameRange(t *testing.T) {
	cfg := Parse([]byte(`{"providerBadgeScale":400,"qualityBadgeScale":400,"ratingBadgeScale":400}`))
	if cfg.ProviderBadgeScale != 400 {
		t.Errorf("providerBadgeScale = %d, want 400", cfg.ProviderBadgeScale)
	}
	if cfg.QualityBadgeScale != 400 {
		t.Errorf("qualityBadgeScale = %d, want 400", cfg.QualityBadgeScale)
	}
	if cfg.RatingBadgeScale != 400 {
		t.Errorf("ratingBadgeScale = %d, want 400", cfg.RatingBadgeScale)
	}

	// The ceiling still holds, and the floor is unchanged.
	over := Parse([]byte(`{"providerBadgeScale":900,"qualityBadgeScale":900}`))
	if over.ProviderBadgeScale != 400 || over.QualityBadgeScale != 400 {
		t.Errorf("above the range: provider=%d quality=%d, want both clamped to 400",
			over.ProviderBadgeScale, over.QualityBadgeScale)
	}
	under := Parse([]byte(`{"providerBadgeScale":10}`))
	if under.ProviderBadgeScale != 70 {
		t.Errorf("below the range: %d, want 70", under.ProviderBadgeScale)
	}
}
