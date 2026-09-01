package compose

import (
	"sync"
	"testing"
)

// resetFamilyLabels re-reads the language files, so a test can write one and
// see it. The real process reads them once at first use.
func resetFamilyLabels(t *testing.T) {
	t.Helper()
	familyLabelsOnce = sync.Once{}
	familyLabelsMap = nil
	t.Cleanup(func() {
		familyLabelsOnce = sync.Once{}
		familyLabelsMap = nil
	})
}
