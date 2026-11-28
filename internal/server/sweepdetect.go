package server

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// unnamedSweepDetector spots a caller with no user agent asking for titles at a
// catalogue sweep's rate. It only logs the crossing unless enforce is set, in
// which case that caller is paced as a sweep instead of keeping a person's place. Callers are keyed by capAddressKey, so a sweep cannot spread
// across the addresses of one IPv6 /64.
type unnamedSweepDetector struct {
	logger  *slog.Logger
	titles  int
	window  time.Duration
	enforce bool
	now     func() time.Time
	mu      sync.Mutex
	callers map[string]*unnamedCaller
	pruned  time.Time
}

type unnamedCaller struct {
	seen    map[string]time.Time
	flagged bool
}

// unnamedSweepMaxCallers bounds the detector's memory under an address flood.
const unnamedSweepMaxCallers = 20000

func newUnnamedSweepDetector(logger *slog.Logger) *unnamedSweepDetector {
	d := &unnamedSweepDetector{
		logger:  logger,
		titles:  envIntRange(logger, "XRDB_UNNAMED_SWEEP_TITLES", 120, 0, 10000),
		window:  time.Duration(envIntRange(logger, "XRDB_UNNAMED_SWEEP_WINDOW_MS", 60000, 1000, 600000)) * time.Millisecond,
		enforce: os.Getenv("XRDB_UNNAMED_SWEEP_ENFORCE") == "1",
		now:     time.Now,
		callers: map[string]*unnamedCaller{},
	}
	if d.titles > 0 {
		logger.Info("Watching callers with no user agent for a sweep's title rate",
			"titles", d.titles, "window_ms", d.window.Milliseconds(), "enforce", d.enforce)
	}
	return d
}

// sweeping records one request for title from address and reports whether that
// caller is past the sweep rate and should be paced as one.
func (d *unnamedSweepDetector) sweeping(address, title string) bool {
	if d == nil || d.titles <= 0 || address == "" || title == "" {
		return false
	}
	key := capAddressKey(address)
	now := d.now()
	d.mu.Lock()
	defer d.mu.Unlock()
	d.pruneLocked(now)
	c := d.callers[key]
	if c == nil {
		if len(d.callers) >= unnamedSweepMaxCallers {
			return false
		}
		c = &unnamedCaller{seen: map[string]time.Time{}}
		d.callers[key] = c
	}
	c.seen[title] = now
	for t, at := range c.seen {
		if now.Sub(at) > d.window {
			delete(c.seen, t)
		}
	}
	over := len(c.seen) >= d.titles
	if over && !c.flagged {
		d.logger.Warn("A caller with no user agent is asking at a sweep's rate",
			"address", key, "titles", len(c.seen), "window_ms", d.window.Milliseconds(), "paced_as_sweep", d.enforce)
	}
	if !over && c.flagged {
		d.logger.Info("A caller with no user agent dropped below the sweep rate", "address", key, "titles", len(c.seen))
	}
	c.flagged = over
	return over && d.enforce
}

func (d *unnamedSweepDetector) pruneLocked(now time.Time) {
	if now.Sub(d.pruned) < d.window {
		return
	}
	d.pruned = now
	for key, c := range d.callers {
		latest := time.Time{}
		for _, at := range c.seen {
			if at.After(latest) {
				latest = at
			}
		}
		if now.Sub(latest) > d.window {
			delete(d.callers, key)
		}
	}
}

func envIntRange(logger *slog.Logger, name string, fallback, low, high int) int {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < low || v > high {
		logger.Warn("Ignored an out-of-range setting and used its default", "name", name, "value", raw, "default", fallback, "min", low, "max", high)
		return fallback
	}
	return v
}

// isTitleRender reports whether path asks for one title's image.
func isTitleRender(path string) bool {
	for _, prefix := range []string{"/poster/", "/backdrop/", "/logo/", "/thumbnail/"} {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}
	return false
}
