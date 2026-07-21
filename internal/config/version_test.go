package config

import "testing"

func TestResolveVersion(t *testing.T) {
	tests := []struct {
		name    string
		stamped string
		env     string
		want    string
	}{
		{
			// The case that matters in production: a container recreated onto a
			// newer image can carry the previous container's environment with
			// it, so a stale XRDB_VERSION outlives the build it described. The
			// stamped value has to win or the binary misreports itself.
			name:    "stamped build beats a stale environment",
			stamped: "dev.20260721.2122.926ec64",
			env:     "dev.20260714.0056.0da1218",
			want:    "dev.20260721.2122.926ec64",
		},
		{
			name: "environment is used when nothing was stamped",
			env:  "v3.1.0",
			want: "v3.1.0",
		},
		{
			name: "falls back to dev when neither is set",
			want: "dev",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			original := buildVersion
			buildVersion = tt.stamped
			t.Cleanup(func() { buildVersion = original })
			t.Setenv("XRDB_VERSION", tt.env)

			if got := resolveVersion(); got != tt.want {
				t.Errorf("resolveVersion() = %q, want %q", got, tt.want)
			}
		})
	}
}
