package compose

import (
	"context"
	"errors"
	"testing"
	"time"

	"xrdb_rewrite/internal/provider"
)

// A bound that cancels every source in flight must not silence health recording
// for all of them. A source that failed on its own, while another was still
// running when the bound fired, is still a source failing us.
func TestAGenuineFailureStillRecordsWhenAnotherSourceWasCut(t *testing.T) {
	stageCtx, cancel := withRatingsStage(context.Background(), time.Minute)
	defer cancel()

	ownFailure := errors.New("omdb: 500 internal server error")
	if !recordsAgainstTheSource(stageCtx, ownFailure) {
		t.Error("a source's own failure went unrecorded inside a bounded stage")
	}
}

func TestOurOwnStageCutIsNotRecordedAgainstTheSource(t *testing.T) {
	cut := errors.Join(errRatingsStageDeadline, context.DeadlineExceeded)
	if recordsAgainstTheSource(context.Background(), cut) {
		t.Error("the stage's own deadline was recorded as the source failing")
	}
}

// Several renders wait on one shared fetch. When the leader's bound cuts it,
// the follower is handed the leader's error while its own context is untouched
// and its own budget nowhere near spent. Without the marker travelling inside
// the flight, the follower records a failure against a healthy source.
func TestAFollowerDoesNotRecordTheLeadersStageCut(t *testing.T) {
	follower, cancel := withRatingsStage(context.Background(), time.Minute)
	defer cancel()

	leadersError := errors.Join(errRatingsStageDeadline, context.DeadlineExceeded)
	if recordsAgainstTheSource(follower, leadersError) {
		t.Error("a follower recorded a failure for a cut another render caused")
	}
}

func TestMarkStageCutLabelsOnlyTheStagesOwnDeadline(t *testing.T) {
	stageCtx, cancel := withRatingsStage(context.Background(), time.Millisecond)
	<-stageCtx.Done()
	cancel()

	marked := markStageCut(stageCtx, context.DeadlineExceeded)
	if !errors.Is(marked, errRatingsStageDeadline) {
		t.Error("a fetch cut by the stage bound was not marked")
	}

	live, cancelLive := withRatingsStage(context.Background(), time.Minute)
	defer cancelLive()
	own := errors.New("wikidata: 502 Bad Gateway")
	if errors.Is(markStageCut(live, own), errRatingsStageDeadline) {
		t.Error("a source's own error was marked as our cut")
	}
	if markStageCut(live, nil) != nil {
		t.Error("a success was turned into an error")
	}
	// errors.Join drops nils rather than short-circuiting, so joining the marker
	// to a nil error yields a non-nil error carrying only the marker. An answer
	// arriving in the same instant the bound fires must stay an answer.
	if got := markStageCut(stageCtx, nil); got != nil {
		t.Errorf("a success at the moment of the cut became %v", got)
	}
	// Nothing installed a stage, so there is nothing to read the deadline off.
	if got := markStageCut(context.Background(), own); !errors.Is(got, own) {
		t.Errorf("an unbounded stage mangled the error: %v", got)
	}
}

// An abandoned render is neither the source's fault nor ours, and the render
// context is the only thing that says so.
func TestAnAbandonedRenderIsNotMarkedAsOurCut(t *testing.T) {
	render, abandon := context.WithCancel(context.Background())
	stageCtx, cancel := withRatingsStage(render, time.Minute)
	defer cancel()
	abandon()

	if errors.Is(markStageCut(stageCtx, context.Canceled), errRatingsStageDeadline) {
		t.Error("a render the viewer abandoned was blamed on the stage bound")
	}
	if recordsAgainstTheSource(stageCtx, context.Canceled) {
		t.Error("an abandoned render was recorded against the source")
	}
}

// A sweep waits in a longer queue than a person, so it gets the longer bound.
// Binding it to the interactive window would cut sweeps off sources they were
// always going to outwait.
func TestTheStageBoundFollowsTheCallersQueueWindow(t *testing.T) {
	p := New(provider.NewRegistry())
	p.SetRenderQueueWait(8 * time.Second)
	p.SetRenderQueueWaitBulk(60 * time.Second)

	if got, want := p.queueWaitFor(provider.CallerInteractive), 8*time.Second; got != want {
		t.Errorf("interactive window %v, want %v", got, want)
	}
	if got, want := p.queueWaitFor(provider.CallerBulk), 60*time.Second; got != want {
		t.Errorf("bulk window %v, want %v", got, want)
	}
	if got, want := p.ratingsStageTimeoutFor(8*time.Second), 6*time.Second; got != want {
		t.Errorf("interactive bound %v, want %v", got, want)
	}
	if got, want := p.ratingsStageTimeoutFor(60*time.Second), 45*time.Second; got != want {
		t.Errorf("bulk bound %v, want %v", got, want)
	}
}

// Nothing set means nothing bounded: a pipeline never told the queue's patience
// must behave as it did before the bound existed.
func TestNoQueueWindowLeavesTheStageUnbounded(t *testing.T) {
	p := New(provider.NewRegistry())
	if got := p.ratingsStageTimeoutFor(0); got != 0 {
		t.Errorf("bound %v with no window, want none", got)
	}
	ctx, cancel := withRatingsStage(context.Background(), 0)
	defer cancel()
	if ratingsStageFrom(ctx) != nil {
		t.Error("an unbounded stage installed a bound")
	}
	if renderContext(ctx) != ctx {
		t.Error("an unbounded stage rewrote the caller's context")
	}
}
