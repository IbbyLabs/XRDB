package compose

import (
	"context"
	"errors"
	"time"

	"xrdb_rewrite/internal/provider"
)

// errRatingsStageDeadline marks a ratings fetch that failed because this
// pipeline stopped waiting, rather than because the source did anything wrong.
// The two are indistinguishable from the error alone and must not be recorded
// the same way: a source that timed out is failing us, our own bound is not.
//
// Attached inside the shared flight rather than after it returns. Several
// renders can wait on one fetch, so an error marked per render would label the
// leader's cut and hand a follower an unmarked timeout against a healthy
// source.
var errRatingsStageDeadline = errors.New("ratings stage deadline")

type ratingsStageKey struct{}

type ratingsStage struct {
	// render is the context the caller gave us, still live when only the stage
	// bound has fired.
	render context.Context
	// stage is render with the bound applied.
	stage context.Context
}

// withRatingsStage bounds the ratings stage and keeps both contexts so a cut
// can be told from an abandoned render. A non-positive bound leaves the context
// alone.
func withRatingsStage(ctx context.Context, d time.Duration) (context.Context, context.CancelFunc) {
	if d <= 0 {
		return ctx, func() {}
	}
	stage, cancel := context.WithTimeout(ctx, d)
	s := &ratingsStage{render: ctx, stage: stage}
	return context.WithValue(stage, ratingsStageKey{}, s), cancel
}

func ratingsStageFrom(ctx context.Context) *ratingsStage {
	s, _ := ctx.Value(ratingsStageKey{}).(*ratingsStage)
	return s
}

// markStageCut labels an error the stage bound caused. Called where the fetch
// returns, inside the shared flight.
func markStageCut(ctx context.Context, err error) error {
	if err == nil {
		return nil
	}
	s := ratingsStageFrom(ctx)
	if s == nil {
		return err
	}
	if errors.Is(s.stage.Err(), context.DeadlineExceeded) && s.render.Err() == nil {
		return errors.Join(errRatingsStageDeadline, err)
	}
	return err
}

// renderContext returns the caller's own context, which outlives a stage cut.
// Health decisions read this rather than the bounded one: the bound cancels
// every source still in flight, and judging them on the cancelled context would
// stop all of them recording whenever one was slower than the rest.
func renderContext(ctx context.Context) context.Context {
	if s := ratingsStageFrom(ctx); s != nil {
		return s.render
	}
	return ctx
}

// ratingsStageTimeout is how long the whole ratings stage may take, derived
// from the queue window this caller waits in by the three-quarters rule the
// artwork stage uses. A sweep's window is the long one, so it keeps waiting
// where a person does not.
func (p *Pipeline) ratingsStageTimeout(ctx context.Context) time.Duration {
	return p.ratingsStageTimeoutFor(p.queueWaitFor(provider.CallerClassFrom(ctx)))
}

func (p *Pipeline) ratingsStageTimeoutFor(queueWait time.Duration) time.Duration {
	if queueWait <= 0 {
		return 0
	}
	return queueWait * 3 / 4
}

// queueWaitFor reports the queue's patience for this caller.
func (p *Pipeline) queueWaitFor(class provider.CallerClass) time.Duration {
	if class == provider.CallerBulk && p.queueWaitBulk > 0 {
		return p.queueWaitBulk
	}
	return p.queueWait
}

// SetRenderQueueWaitBulk tells the pipeline how long a sweep waits for a slot.
// Without it a sweep is bounded by the interactive window, which is shorter
// than the sources it waits on.
func (p *Pipeline) SetRenderQueueWaitBulk(d time.Duration) {
	if d <= 0 {
		return
	}
	p.queueWaitBulk = d
}
