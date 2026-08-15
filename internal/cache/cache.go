// Package cache provides a two-tier render cache: in-memory LRU backed by the filesystem.
package cache

import (
	"container/list"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// Entry is a cached render result.
type Entry struct {
	Data      []byte
	ExpiresAt time.Time
}

// Disk tier bounds, enforced by the background sweep. Without the sweep the
// directory only shrinks when an expired key happens to be read again, so a
// long-lived instance accumulates files without limit.
const (
	sweepInterval = 10 * time.Minute
	// Defaults for the disk tier when nothing is configured. Two GiB holds only
	// a few thousand renders, and a catalogue is far larger than that, so an
	// instance with disk to spare should raise them: every evicted entry is a
	// render paid for again.
	defaultMaxDiskFiles = 20_000
	defaultMaxDiskBytes = 2 << 30 // 2 GiB
	expiryHeaderSize    = 8
)

type hotEntry struct {
	key   string
	entry *Entry
}

// Cache is a thread-safe two-tier render cache.
// Hot entries live in memory, bounded by entry count and total bytes; all
// entries persist to disk, bounded by the background sweep.
type Cache struct {
	dir        string
	ttl        time.Duration
	maxEntries int
	maxBytes   int64
	// Disk tier bounds. Separate from the hot tier above: the hot tier is memory
	// and stays small, the disk tier is what a catalogue re-read actually hits.
	maxDiskFiles int
	maxDiskBytes int64

	// Recent per-sweep removal counts, for reporting the term entries are
	// actually getting. One sweep is not enough to derive it from: across six
	// hours the count ranged 54 to 896, which is a 16x spread in the figure and
	// would report whichever sweep an operator happened to read.
	removedMu   sync.Mutex
	removedRing []int

	// expiryIndex holds each disk entry's expiry, keyed by filename. The sweep
	// consulted the files themselves, which meant opening all 35,000 every ten
	// minutes: measured at 97% of a sweep once the entries are out of page
	// cache, and a 12.9GB cache on this box never fits in it. Held here instead
	// so a sweep opens nothing. The read path is untouched.
	expiryMu    sync.RWMutex
	expiryIndex map[string]int64
	// readSince holds the entries asked for again since this process started.
	// Eviction takes never-read entries before read ones, which puts a sweep's
	// one-off renders ahead of anything a person came back to.
	//
	// Not atime: the pass that builds the expiry index opens every existing
	// entry, which sets atime on all of them — 97.5% of production entries read
	// as re-read that way, and the signal dies at every restart.
	//
	// Absence means "not known to have been read", not "never read". Entries
	// from before this process have no history here and stay in age order,
	// which is what happens today.
	readSince map[string]struct{}

	mu       sync.Mutex
	hot      map[string]*list.Element // value: *hotEntry
	lru      *list.List               // front = least recently used
	hotBytes int64

	// Maintained incrementally on Set/expiry and reconciled by each sweep,
	// so Stats never has to enumerate the cache directory.
	//
	// diskMu serialises an incremental adjustment against the sweep's
	// reconcile. Without it a Set landing between the sweep counting the
	// directory and storing that count is either counted twice or lost, which
	// is what made the reported entry count drift. Kept separate from mu so a
	// reconcile never blocks a cache read.
	diskMu    sync.RWMutex
	diskFiles atomic.Int64
	diskBytes atomic.Int64

	stop     chan struct{}
	stopOnce sync.Once
	done     chan struct{}
}

// New creates a Cache backed by dir, bounded in memory by maxEntries and
// maxBytes, and starts the background disk sweep. Call Close to stop it.
func New(dir string, ttl time.Duration, maxEntries int, maxBytes int64) (*Cache, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("cache mkdir: %w", err)
	}
	c := &Cache{
		dir:          dir,
		ttl:          ttl,
		maxEntries:   maxEntries,
		maxBytes:     maxBytes,
		maxDiskFiles: defaultMaxDiskFiles,
		maxDiskBytes: defaultMaxDiskBytes,
		hot:          make(map[string]*list.Element, maxEntries),
		lru:          list.New(),
		stop:         make(chan struct{}),
		done:         make(chan struct{}),
	}
	go c.sweepLoop()
	return c, nil
}

// diskBounds reads the disk limits under the lock. SetDiskBounds can run while
// a sweep is deciding what to evict, so reading the fields directly is a data
// race — the writer holds c.mu and these readers did not.
func (c *Cache) diskBounds() (int, int64) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.maxDiskFiles, c.maxDiskBytes
}

// SetDiskBounds raises or lowers the disk tier's limits. Values <= 0 leave the
// corresponding bound at its default. Call before the cache is used.
func (c *Cache) SetDiskBounds(files int, bytes int64) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if files > 0 {
		c.maxDiskFiles = files
	}
	if bytes > 0 {
		c.maxDiskBytes = bytes
	}
}

// Close stops the background disk sweep and waits for it to exit.
// Safe to call multiple times and from concurrent goroutines.
func (c *Cache) Close() {
	c.stopOnce.Do(func() { close(c.stop) })
	<-c.done
}

// Get returns a cached entry for key, or (nil, false) on miss or expiry.
func (c *Cache) Get(key string) (*Entry, bool) {
	c.mu.Lock()

	// Hot tier — check without holding for I/O.
	if el, ok := c.hot[key]; ok {
		he := el.Value.(*hotEntry)
		if time.Now().Before(he.entry.ExpiresAt) {
			c.lru.MoveToBack(el)
			c.mu.Unlock()
			c.noteRead(filepath.Base(c.diskPath(key)))
			return he.entry, true
		}
		c.removeLocked(el)
	}
	diskPath := c.diskPath(key)
	c.mu.Unlock()

	// Disk tier — no lock held during filesystem I/O.
	data, err := os.ReadFile(diskPath)
	if err != nil {
		return nil, false
	}
	if len(data) < expiryHeaderSize {
		return nil, false
	}
	exp := decodeExpiry(data[:expiryHeaderSize])
	if time.Now().UnixNano() > exp {
		c.diskMu.RLock()
		if info, statErr := os.Stat(diskPath); statErr == nil {
			if os.Remove(diskPath) == nil {
				c.forgetExpiry(filepath.Base(diskPath))
				c.diskFiles.Add(-1)
				c.diskBytes.Add(-info.Size())
			}
		}
		c.diskMu.RUnlock()
		return nil, false
	}
	e := &Entry{Data: data[expiryHeaderSize:], ExpiresAt: time.Unix(0, exp)}
	c.mu.Lock()
	// Re-check hot tier: another goroutine may have promoted this entry while we were reading disk.
	if el, ok := c.hot[key]; ok {
		he := el.Value.(*hotEntry)
		if time.Now().Before(he.entry.ExpiresAt) {
			c.lru.MoveToBack(el)
			c.mu.Unlock()
			c.noteRead(filepath.Base(c.diskPath(key)))
			return he.entry, true
		}
		c.removeLocked(el)
	}
	c.storeLocked(key, e)
	c.mu.Unlock()
	c.noteRead(filepath.Base(diskPath))
	return e, true
}

// Set stores data for key using the cache's default TTL.
func (c *Cache) Set(key string, data []byte) error {
	return c.SetWithTTL(key, data, 0)
}

// SetWithTTL stores data for key with an explicit TTL.
// If ttl is zero the cache's default TTL is used.
func (c *Cache) SetWithTTL(key string, data []byte, ttl time.Duration) error {
	if ttl <= 0 {
		ttl = c.ttl
	}
	exp := time.Now().Add(ttl)
	e := &Entry{Data: data, ExpiresAt: exp}

	c.mu.Lock()
	if el, ok := c.hot[key]; ok {
		c.removeLocked(el)
	}
	c.storeLocked(key, e)
	diskPath := c.diskPath(key)
	c.mu.Unlock()

	// Persist to disk — no lock held during filesystem I/O.
	payload := make([]byte, expiryHeaderSize+len(data))
	binary.BigEndian.PutUint64(payload[:expiryHeaderSize], uint64(exp.UnixNano()))
	copy(payload[expiryHeaderSize:], data)

	// The write and the counter adjustment are one critical section against the
	// sweep's reconcile. Split apart, a reconcile can count the new file and
	// then have this adjustment added on top of it.
	c.diskMu.RLock()
	defer c.diskMu.RUnlock()

	var prevSize int64 = -1
	if info, err := os.Stat(diskPath); err == nil {
		prevSize = info.Size()
	}
	if err := os.WriteFile(diskPath, payload, 0o644); err != nil {
		return fmt.Errorf("cache write: %w", err)
	}
	c.noteExpiry(filepath.Base(diskPath), exp.UnixNano())
	if prevSize >= 0 {
		c.diskBytes.Add(int64(len(payload)) - prevSize)
	} else {
		c.diskFiles.Add(1)
		c.diskBytes.Add(int64(len(payload)))
	}
	return nil
}

// TTL returns the default entry lifetime, which is what Set and SetWithTTL(0)
// apply. Callers that advertise a freshness lifetime downstream need it to
// resolve the "unset" case to the value the cache will actually use.
func (c *Cache) TTL() time.Duration {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ttl
}

// Delete removes a single entry from both tiers. It reports whether anything
// was actually removed, so a caller can tell a real invalidation from a no-op.
func (c *Cache) Delete(key string) bool {
	c.mu.Lock()
	removed := false
	if el, ok := c.hot[key]; ok {
		c.removeLocked(el)
		removed = true
	}
	diskPath := c.diskPath(key)
	c.mu.Unlock()

	c.diskMu.RLock()
	if info, err := os.Stat(diskPath); err == nil {
		if os.Remove(diskPath) == nil {
			c.forgetExpiry(filepath.Base(diskPath))
			c.diskFiles.Add(-1)
			c.diskBytes.Add(-info.Size())
			removed = true
		}
	}
	c.diskMu.RUnlock()
	return removed
}

// Purge empties both tiers and returns the number of disk entries removed.
// Renders are reproducible from their sources, so dropping them all costs
// latency on the next request rather than data.
func (c *Cache) Purge() int {
	c.mu.Lock()
	c.hot = make(map[string]*list.Element, c.maxEntries)
	c.lru.Init()
	c.hotBytes = 0
	dir := c.dir
	c.mu.Unlock()

	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	removed := 0
	for _, de := range entries {
		if de.IsDir() || filepath.Ext(de.Name()) != ".bin" {
			continue
		}
		if os.Remove(filepath.Join(dir, de.Name())) == nil {
			c.forgetExpiry(de.Name())
			removed++
		}
	}
	// Re-derive the counters from what survived rather than assuming the
	// directory is now empty: a concurrent Set may have written during the walk.
	files, bytes := c.diskBounds()
	c.sweepWithBounds(files, bytes)
	return removed
}

// Stats returns a snapshot of cache state without touching the filesystem.
func (c *Cache) Stats() Stats {
	c.mu.Lock()
	hotCount := len(c.hot)
	hotBytes := c.hotBytes
	dir := c.dir
	ttl := c.ttl
	c.mu.Unlock()

	return Stats{
		HotEntries:  hotCount,
		HotBytes:    hotBytes,
		DiskEntries: int(c.diskFiles.Load()),
		DiskBytes:   c.diskBytes.Load(),
		Dir:         dir,
		TTL:         ttl.String(),
	}
}

// Stats is a point-in-time view of cache state.
type Stats struct {
	HotEntries  int    `json:"hotEntries"`
	HotBytes    int64  `json:"hotBytes"`
	DiskEntries int    `json:"diskEntries"`
	DiskBytes   int64  `json:"diskBytes"`
	Dir         string `json:"dir"`
	TTL         string `json:"ttl"`
}

// storeLocked inserts key at the most-recently-used position and evicts from
// the least-recently-used end until both memory caps hold.
// Must be called with c.mu held and key absent from c.hot.
func (c *Cache) storeLocked(key string, e *Entry) {
	el := c.lru.PushBack(&hotEntry{key: key, entry: e})
	c.hot[key] = el
	c.hotBytes += int64(len(e.Data))
	for (len(c.hot) > c.maxEntries || c.hotBytes > c.maxBytes) && c.lru.Len() > 1 {
		front := c.lru.Front()
		if front == nil || front == el {
			break
		}
		c.removeLocked(front)
	}
}

// removeLocked drops an element from both LRU structures and the byte count.
// Must be called with c.mu held.
func (c *Cache) removeLocked(el *list.Element) {
	he := el.Value.(*hotEntry)
	c.lru.Remove(el)
	delete(c.hot, he.key)
	c.hotBytes -= int64(len(he.entry.Data))
}

func (c *Cache) sweepLoop() {
	defer close(c.done)
	c.sweep()
	ticker := time.NewTicker(sweepInterval)
	defer ticker.Stop()
	for {
		select {
		case <-c.stop:
			return
		case <-ticker.C:
			c.sweep()
		}
	}
}

// sweep removes expired disk entries, enforces the disk bounds oldest-first,
// and reconciles the counters that back Stats.
func (c *Cache) sweep() {
	files, bytes := c.diskBounds()
	c.sweepWithBounds(files, bytes)
}

func (c *Cache) sweepWithBounds(fileBound int, byteBound int64) {
	// A sweep opens every file to read its expiry header, so its cost scales
	// with the number of entries rather than with what it removes. Reported so
	// that cost is a figure rather than an inference from the entry count.
	sweepStart := time.Now()
	dirEntries, err := os.ReadDir(c.dir)
	if err != nil {
		return
	}
	// Split so the cost can be attributed. The scan is the walk plus one stat and
	// one expiry read per file; removal is the deletions. Optimising the opens is
	// only worth doing if the scan is where the time goes, and a single total
	// cannot say.
	readDirMs := time.Since(sweepStart).Milliseconds()
	scanStart := time.Now()
	var expiryReadNs int64
	// Snapshot before the walk, prune after it. A key whose file went away
	// outside the cache's own paths — a crash mid-write, someone clearing the
	// directory by hand — otherwise stays in the index for the life of the
	// process. Snapshotting first means an entry written during the walk is not
	// mistaken for one of those.
	indexBefore := c.indexKeys()
	seen := make(map[string]struct{}, len(dirEntries))

	type diskFile struct {
		path  string
		size  int64
		mtime time.Time
		read  bool
	}
	files := make([]diskFile, 0, len(dirEntries))
	var expired, evicted int
	now := time.Now().UnixNano()
	for _, de := range dirEntries {
		if de.IsDir() || filepath.Ext(de.Name()) != ".bin" {
			continue
		}
		path := filepath.Join(c.dir, de.Name())
		seen[de.Name()] = struct{}{}
		info, err := de.Info()
		if err != nil {
			continue
		}
		expiryStart := time.Now()
		exp, okExp := c.expiryOf(de.Name(), path)
		expiryReadNs += time.Since(expiryStart).Nanoseconds()
		if okExp && now > exp {
			if os.Remove(path) == nil {
				c.forgetExpiry(de.Name())
				expired++
			}
			continue
		}
		files = append(files, diskFile{path: path, size: info.Size(), mtime: info.ModTime()})
	}

	orphans := c.pruneIndex(indexBefore, seen)
	scanMs := time.Since(scanStart).Milliseconds()
	removeStart := time.Now()
	// Never-read entries go first, oldest-written within each group. A catalogue
	// sweep writes entries it does not come back to; a person's poster is asked
	// for again. Age alone cannot tell those apart, which is what made a 72 hour
	// term evict things people were still using.
	for i := range files {
		files[i].read = c.wasRead(filepath.Base(files[i].path))
	}
	sort.Slice(files, func(i, j int) bool {
		if files[i].read != files[j].read {
			return !files[i].read
		}
		return files[i].mtime.Before(files[j].mtime)
	})
	var totalBytes int64
	unread := 0
	for _, f := range files {
		totalBytes += f.size
		if !f.read {
			unread++
		}
	}
	evictedRead := 0
	remaining := len(files)
	for _, f := range files {
		if remaining <= fileBound && totalBytes <= byteBound {
			break
		}
		if os.Remove(f.path) == nil {
			c.forgetExpiry(filepath.Base(f.path))
			remaining--
			totalBytes -= f.size
			evicted++
			if f.read {
				evictedRead++
			}
		}
	}

	// Recount under the exclusive side rather than storing the figures gathered
	// above: those were taken before any deletions and while writes were still
	// landing, so storing them would reintroduce the drift this guards against.
	c.diskMu.Lock()
	nFiles, nBytes := countDir(c.dir)
	c.diskFiles.Store(nFiles)
	c.diskBytes.Store(nBytes)
	c.diskMu.Unlock()

	// A sweep that removes nothing and one that never ran look identical from
	// outside, so every pass says what it did and what it left behind.
	attrs := []any{
		"expired", expired, "evicted", evicted,
		"files", nFiles, "bytes", nBytes,
		"file_bound", fileBound, "byte_bound", byteBound,
		"took_ms", time.Since(sweepStart).Milliseconds(),
		"readdir_ms", readDirMs,
		"scan_ms", scanMs,
		"expiry_reads_ms", expiryReadNs / 1e6,
		"remove_ms", time.Since(removeStart).Milliseconds(),
		"index_orphans_dropped", orphans,
		"unread_on_disk", unread,
		"evicted_read", evictedRead,
	}
	// A configured TTL and a byte ceiling are two limits on the same entries, and
	// the ceiling wins silently: once the tier is full, entries leave by age
	// rather than by term and the TTL becomes unreachable. Reported as the term
	// entries are actually getting, so an operator sizing a disk is comparing
	// against what happens rather than against what they set.
	if median, samples, ok := c.noteRemoved(expired + evicted); ok && nFiles > 0 {
		turnover := time.Duration(float64(nFiles) / float64(median) * float64(sweepInterval))
		attrs = append(attrs, "effective_ttl_hours", turnover.Hours(), "sweeps_sampled", samples)
		if c.ttl > 0 && turnover < c.ttl {
			attrs = append(attrs, "configured_ttl_hours", c.ttl.Hours())
		}
	}
	switch {
	case nFiles > int64(fileBound) || nBytes > byteBound:
		slog.Warn("The render cache is still over its bounds after a sweep", attrs...)
	case expired > 0 || evicted > 0:
		slog.Info("Swept the render cache", attrs...)
	default:
		slog.Debug("Swept the render cache, nothing to remove", attrs...)
	}
}

// readExpiry reads the expiry header without loading the payload.
func readExpiry(path string) (int64, bool) {
	f, err := os.Open(path)
	if err != nil {
		return 0, false
	}
	defer f.Close()
	var hdr [expiryHeaderSize]byte
	if _, err := io.ReadFull(f, hdr[:]); err != nil {
		return 0, false
	}
	return decodeExpiry(hdr[:]), true
}

// decodeExpiry parses the big-endian Unix nanosecond expiry header.
func decodeExpiry(hdr []byte) int64 {
	return int64(binary.BigEndian.Uint64(hdr))
}

func (c *Cache) diskPath(key string) string {
	sum := sha256.Sum256([]byte(key))
	return filepath.Join(c.dir, hex.EncodeToString(sum[:])+".bin")
}

// countDir totals the cache entries on disk. Called only by the sweep's
// reconcile, never by Stats, which reads the counters instead.
func countDir(dir string) (nFiles int64, nBytes int64) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, 0
	}
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".bin" {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		nFiles++
		nBytes += info.Size()
	}
	return nFiles, nBytes
}

// DiskBoundsInfo reports the disk tier limits in force, so startup can log what
// actually took effect rather than what was requested.
type DiskBoundsInfo struct {
	Files int
	Bytes int64
}

// DiskBounds returns the limits currently applied to the disk tier.
func (c *Cache) DiskBounds() DiskBoundsInfo {
	if c == nil {
		return DiskBoundsInfo{}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	return DiskBoundsInfo{Files: c.maxDiskFiles, Bytes: c.maxDiskBytes}
}

// removedSamples is how many sweeps the effective term is derived from once the
// ring is full: two hours of history at a ten minute interval, enough that one
// heavy or one quiet sweep does not move the answer.
//
// removedMinSamples is when it starts reporting. Waiting for the full ring means
// two hours of uptime, and a release restarts the container, so a metric that
// only exists after two hours can be absent most of the time it is wanted. Four
// is enough for a median to mean something, and the count is reported alongside
// so a reader can see how thin it is rather than being asked to assume.
const (
	removedSamples    = 12
	removedMinSamples = 4
)

// noteRemoved records this sweep's removal count and reports the median of the
// recent ones. It reports false until there is enough history to have a median
// worth the name: with one sample the median is that sample, which is the
// single-reading problem wearing a different word.
func (c *Cache) noteRemoved(removed int) (int, int, bool) {
	c.removedMu.Lock()
	defer c.removedMu.Unlock()

	c.removedRing = append(c.removedRing, removed)
	if len(c.removedRing) > removedSamples {
		c.removedRing = c.removedRing[len(c.removedRing)-removedSamples:]
	}
	if len(c.removedRing) < removedMinSamples {
		return 0, 0, false
	}

	sorted := append([]int(nil), c.removedRing...)
	sort.Ints(sorted)
	median := sorted[len(sorted)/2]
	if median <= 0 {
		return 0, 0, false
	}
	return median, len(sorted), true
}

// noteExpiry records an entry's expiry against its filename.
func (c *Cache) noteExpiry(name string, exp int64) {
	c.expiryMu.Lock()
	if c.expiryIndex == nil {
		c.expiryIndex = make(map[string]int64)
	}
	c.expiryIndex[name] = exp
	c.expiryMu.Unlock()
}

// forgetExpiry drops an entry that has left the disk.
func (c *Cache) forgetExpiry(name string) {
	c.expiryMu.Lock()
	delete(c.expiryIndex, name)
	delete(c.readSince, name)
	c.expiryMu.Unlock()
}

// expiryOf reports an entry's expiry from the index, reading the file only when
// the index has not seen it. Entries written before this process started are the
// only ones that reach the file, and each is indexed once on the way past, so a
// restart costs one pass rather than one per sweep.
func (c *Cache) expiryOf(name, path string) (int64, bool) {
	c.expiryMu.RLock()
	exp, ok := c.expiryIndex[name]
	c.expiryMu.RUnlock()
	if ok {
		return exp, true
	}
	exp, ok = readExpiry(path)
	if ok {
		c.noteExpiry(name, exp)
	}
	return exp, ok
}

// indexKeys snapshots the indexed filenames.
func (c *Cache) indexKeys() []string {
	c.expiryMu.RLock()
	defer c.expiryMu.RUnlock()
	out := make([]string, 0, len(c.expiryIndex))
	for name := range c.expiryIndex {
		out = append(out, name)
	}
	return out
}

// pruneIndex drops indexed names that the sweep did not find on disk, and
// reports how many. Only names present before the walk are considered, so an
// entry written while it ran is left alone.
func (c *Cache) pruneIndex(before []string, seen map[string]struct{}) int {
	c.expiryMu.Lock()
	defer c.expiryMu.Unlock()
	dropped := 0
	for _, name := range before {
		if _, ok := seen[name]; ok {
			continue
		}
		if _, ok := c.expiryIndex[name]; ok {
			delete(c.expiryIndex, name)
			dropped++
		}
	}
	// Read markers for entries that are no longer on disk. Keyed off the index
	// as well as the scan, so an entry written after the scan started keeps its
	// marker.
	for name := range c.readSince {
		if _, ok := seen[name]; ok {
			continue
		}
		if _, ok := c.expiryIndex[name]; ok {
			continue
		}
		delete(c.readSince, name)
	}
	return dropped
}

// noteRead records that an entry was asked for again.
func (c *Cache) noteRead(name string) {
	c.expiryMu.Lock()
	if c.readSince == nil {
		c.readSince = make(map[string]struct{})
	}
	c.readSince[name] = struct{}{}
	c.expiryMu.Unlock()
}

// wasRead reports whether an entry has been asked for since this process
// started. False means "not known to have been read" — an entry from a previous
// process has no history here.
func (c *Cache) wasRead(name string) bool {
	c.expiryMu.RLock()
	_, ok := c.readSince[name]
	c.expiryMu.RUnlock()
	return ok
}
