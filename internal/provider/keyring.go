package provider

import (
	"log/slog"
	"math/rand/v2"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// keySpentFor is how long a credential stays skipped after the service said its
// allowance was spent. The reset hour is the provider's and none of them
// publish it, so the mark decays rather than following a schedule: an hour
// costs one wasted request per key and recovers promptly once the day rolls.
const keySpentFor = time.Hour

// keyRing hands out one of several credentials for a source and moves on from
// one the service has said is spent.
//
// Rotation multiplies a daily quota and does nothing for a per-second rate, so
// it is wired only to the sources that meter by the day. A source paced by rate
// gains no headroom from a second key and would carry an inert control.
type keyRing struct {
	mu     sync.Mutex
	keys   []string
	spent  map[string]time.Time
	cursor int
	served int
}

// Key list modes, from XRDB_KEY_ROTATION. fill uses each key until it is spent;
// turns and random move on after keyBatch requests, in order or at random.
const (
	rotateFill   = "fill"
	rotateTurns  = "turns"
	rotateRandom = "random"
)

var (
	keyMode  = readKeyMode()
	keyBatch = envInt("XRDB_KEY_BATCH_SIZE", 1, 1, maxKeyBatch)
)

const maxKeyBatch = 1_000_000

func readKeyMode() string {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv("XRDB_KEY_ROTATION")))
	switch raw {
	case "":
		return rotateFill
	case rotateFill, rotateTurns, rotateRandom:
		return raw
	}
	slog.Default().Warn("Ignoring an unreadable setting and keeping the default",
		"variable", "XRDB_KEY_ROTATION", "value", raw, "default", rotateFill)
	return rotateFill
}

// KeyRotation describes the key list mode in effect, for the startup log.
func KeyRotation() string {
	if keyMode == rotateFill {
		return rotateFill
	}
	return keyMode + ", " + strconv.Itoa(keyBatch) + " per key"
}

// nextIndex is the key to move to after from, in a ring of n.
func nextIndex(from, n int) int {
	if keyMode == rotateRandom && n > 1 {
		return (from + 1 + rand.IntN(n-1)) % n
	}
	return (from + 1) % n
}

// newKeyRing reads several credentials from one setting, separated by commas.
// A single key is the ordinary case and produces a ring of one.
func newKeyRing(raw string) *keyRing {
	r := &keyRing{spent: map[string]time.Time{}}
	for _, part := range strings.Split(raw, ",") {
		if part = strings.TrimSpace(part); part != "" {
			r.keys = append(r.keys, part)
		}
	}
	return r
}

// current returns the credential to use now: the first that is not marked
// spent. When every key is marked the marks are cleared and the first is
// returned, so a source is never left with nothing to call.
func (r *keyRing) current() string {
	if r == nil {
		return ""
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.keys) == 0 {
		return ""
	}
	now := time.Now()
	for _, key := range r.keys {
		if at, marked := r.spent[key]; !marked || now.Sub(at) >= keySpentFor {
			delete(r.spent, key)
			return key
		}
	}
	clear(r.spent)
	return r.keys[0]
}

// pick returns the credential for an outgoing request. In fill mode it is
// current; otherwise a key serves keyBatch requests before another takes over,
// and a key marked spent is passed over.
func (r *keyRing) pick() string {
	if keyMode == rotateFill {
		return r.current()
	}
	if r == nil {
		return ""
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	n := len(r.keys)
	if n == 0 {
		return ""
	}
	r.cursor %= n
	if r.served >= keyBatch {
		r.cursor, r.served = nextIndex(r.cursor, n), 0
	}
	now := time.Now()
	for i := 0; i < n; i++ {
		idx := (r.cursor + i) % n
		key := r.keys[idx]
		if at, marked := r.spent[key]; !marked || now.Sub(at) >= keySpentFor {
			delete(r.spent, key)
			if idx != r.cursor {
				r.cursor, r.served = idx, 0
			}
			r.served++
			return key
		}
	}
	clear(r.spent)
	r.served++
	return r.keys[r.cursor]
}

// markSpent records that the service refused this credential because its
// allowance is gone, so current moves to the next.
//
// Only a typed quota refusal reaches here. A refusal we cannot classify is
// retried on the same key instead: mistaking a blip for exhaustion burns every
// key in the ring and leaves nothing to fall back to, while mistaking
// exhaustion for a blip costs one retry and rotates on the next typed refusal.
// That asymmetry is the reason, not a measurement — the case is too rare on
// this instance to count.
func (r *keyRing) markSpent(key string) {
	if r == nil || key == "" {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, known := r.spent[key]; !known {
		r.spent[key] = time.Now()
	}
}

// set replaces the credentials, keeping any mark that still applies to a key
// that survived the change.
func (r *keyRing) set(raw string) {
	if r == nil {
		return
	}
	next := newKeyRing(raw)
	r.mu.Lock()
	defer r.mu.Unlock()
	kept := map[string]time.Time{}
	for _, key := range next.keys {
		if at, marked := r.spent[key]; marked {
			kept[key] = at
		}
	}
	r.keys, r.spent = next.keys, kept
	r.cursor, r.served = 0, 0
}

// size reports how many credentials the ring holds, for the admin surface.
func (r *keyRing) size() int {
	if r == nil {
		return 0
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.keys)
}
