package config

import (
	"reflect"
	"testing"
)

// XRDB_RENDER_QUEUE_WAIT_BURST_SECONDS is retired: an over-cap caller takes the
// ordinary ceiling. A retired name that still moves a value is worse than one
// that is gone, so setting it must change nothing the process runs on.
func TestTheRetiredBurstWaitChangesNothing(t *testing.T) {
	without := Load()
	t.Setenv("XRDB_RENDER_QUEUE_WAIT_BURST_SECONDS", "1")
	with := Load()
	if !reflect.DeepEqual(with, without) {
		t.Error("setting the retired burst wait changed the loaded config")
	}
}
