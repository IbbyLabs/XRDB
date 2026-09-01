// Command rt-refresh rewrites internal/certified/titles.json from Rotten
// Tomatoes' own pages.
//
// It is not part of the server. Nothing reads the network at render time: the
// render path answers from the bundled file, so a run that is blocked or
// interrupted costs freshness rather than a badge.
//
// Two stages, and only the second touches Rotten Tomatoes:
//
//	Wikidata  IMDb id -> Rotten Tomatoes path, batched, free, no key
//	the page  one paced read per title, for the certified flag they publish
//
// The certified flag is theirs. XRDB does not compute it: their rule needs a Top
// Critics count and a release breadth no API carries, so anything derived here
// would be a guess wearing their name.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	userAgent = "XRDB/rt-refresh (https://github.com/IbbyLabs/XRDB; ibby@ibbylabs.dev)"
	// A page is 200KB and the flag is in the first third of it, but the whole
	// body is read rather than streamed: the parse is a search and a truncated
	// document silently answers "not certified".
	maxPageBytes = 4 << 20
)

func main() {
	var (
		idsPath  = flag.String("ids", "", "file of IMDb ids, one per line")
		outPath  = flag.String("out", "internal/certified/titles.json", "file to rewrite")
		pause    = flag.Duration("pace", 3*time.Second, "wait between page reads")
		maxReads = flag.Int("max", 0, "stop after this many page reads; 0 is no limit")
		dryRun   = flag.Bool("dry-run", false, "read and report, write nothing")
	)
	flag.Parse()

	log := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	if *idsPath == "" {
		log.Error("No id list given; pass -ids with one IMDb id per line")
		os.Exit(2)
	}
	ids, err := readIDs(*idsPath)
	if err != nil {
		log.Error("Could not read the id list", "path", *idsPath, "error", err)
		os.Exit(1)
	}
	log.Info("Read the id list", "ids", len(ids))

	client := &http.Client{Timeout: 30 * time.Second}
	paths, err := rtPaths(client, ids)
	if err != nil {
		log.Error("Could not map ids to Rotten Tomatoes paths", "error", err)
		os.Exit(1)
	}
	log.Info("Mapped ids to paths", "mapped", len(paths), "unmapped", len(ids)-len(paths))

	// The existing file is the floor. A title this run cannot reach keeps the
	// answer it already had rather than losing its mark to a bad night.
	out := loadExisting(*outPath, log)

	read := 0
	for _, id := range ids {
		path, ok := paths[id]
		if !ok {
			continue
		}
		if *maxReads > 0 && read >= *maxReads {
			log.Info("Stopping at the read limit", "read", read, "remaining", len(paths)-read)
			break
		}
		if read > 0 {
			time.Sleep(*pause)
		}
		read++
		t, err := readTitle(client, path)
		if err != nil {
			log.Warn("Could not read a title; keeping whatever the file already had",
				"imdb", id, "path", path, "error", err)
			continue
		}
		out[id] = t
		log.Info("Read a title", "imdb", id, "certified", t.Certified, "score", t.Score)
	}

	if *dryRun {
		log.Info("Dry run, nothing written", "titles", len(out), "read", read)
		return
	}
	if err := write(*outPath, out); err != nil {
		log.Error("Could not write the file", "path", *outPath, "error", err)
		os.Exit(1)
	}
	log.Info("Wrote the file", "path", *outPath, "titles", len(out), "read_this_run", read)
}

type title struct {
	Certified bool `json:"certified"`
	Score     int  `json:"score"`
}

func readIDs(path string) ([]string, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var out []string
	for _, line := range strings.Split(string(raw), "\n") {
		id := strings.ToLower(strings.TrimSpace(line))
		if !isIMDbID(id) || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out, nil
}

func isIMDbID(s string) bool {
	if !strings.HasPrefix(s, "tt") || len(s) < 3 {
		return false
	}
	for _, r := range s[2:] {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// rtPaths asks Wikidata for each id's Rotten Tomatoes path. Batched: one query
// carries every id, so the mapping costs one request however many titles.
func rtPaths(client *http.Client, ids []string) (map[string]string, error) {
	const batch = 400
	out := map[string]string{}
	for start := 0; start < len(ids); start += batch {
		end := min(start+batch, len(ids))
		values := `"` + strings.Join(ids[start:end], `" "`) + `"`
		q := `SELECT ?imdb ?rt WHERE { VALUES ?imdb { ` + values +
			` } ?item wdt:P345 ?imdb . ?item wdt:P1258 ?rt . }`

		req, err := http.NewRequest(http.MethodGet,
			"https://query.wikidata.org/sparql?format=json&query="+url.QueryEscape(q), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/sparql-results+json")
		req.Header.Set("User-Agent", userAgent)
		res, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		var doc struct {
			Results struct {
				Bindings []struct {
					IMDb struct{ Value string } `json:"imdb"`
					RT   struct{ Value string } `json:"rt"`
				} `json:"bindings"`
			} `json:"results"`
		}
		err = json.NewDecoder(res.Body).Decode(&doc)
		res.Body.Close()
		if err != nil {
			return nil, err
		}
		for _, b := range doc.Results.Bindings {
			if p := strings.Trim(b.RT.Value, "/"); p != "" {
				out[strings.ToLower(b.IMDb.Value)] = p
			}
		}
		time.Sleep(time.Second) // the same floor the render path paces Wikidata at
	}
	return out, nil
}

// criticsScore finds the block Rotten Tomatoes embeds on the page. Anchored on
// the key rather than parsing the document, because the surrounding markup
// changes far more often than the data does.
var criticsScore = regexp.MustCompile(`"criticsScore":\{[^}]*\}`)

var (
	certifiedField = regexp.MustCompile(`"certified":(true|false)`)
	scoreField     = regexp.MustCompile(`"score":"(\d{1,3})"`)
)

func readTitle(client *http.Client, path string) (title, error) {
	req, err := http.NewRequest(http.MethodGet, "https://www.rottentomatoes.com/"+path, nil)
	if err != nil {
		return title{}, err
	}
	req.Header.Set("User-Agent", userAgent)
	res, err := client.Do(req)
	if err != nil {
		return title{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return title{}, fmt.Errorf("%s", res.Status)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, maxPageBytes))
	if err != nil {
		return title{}, err
	}
	return parseTitle(string(body))
}

// parseTitle reads the certified flag and the score out of a page.
//
// A page that carries no critics block at all is an error rather than "not
// certified": a block, a redirect to a search page and a genuine absence all
// look the same to a caller that treats a miss as false, and the first two are
// the ones that would quietly strip marks from the file.
func parseTitle(body string) (title, error) {
	block := criticsScore.FindString(body)
	if block == "" {
		return title{}, fmt.Errorf("no critics score on the page")
	}
	m := certifiedField.FindStringSubmatch(block)
	if m == nil {
		return title{}, fmt.Errorf("the critics block names no certified flag")
	}
	t := title{Certified: m[1] == "true"}
	if s := scoreField.FindStringSubmatch(block); s != nil {
		t.Score, _ = strconv.Atoi(s[1])
	}
	return t, nil
}

func loadExisting(path string, log *slog.Logger) map[string]title {
	out := map[string]title{}
	raw, err := os.ReadFile(path)
	if err != nil {
		return out
	}
	var doc struct {
		Titles map[string]title `json:"titles"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		log.Warn("The existing file could not be read; starting from nothing", "error", err)
		return out
	}
	for k, v := range doc.Titles {
		out[strings.ToLower(k)] = v
	}
	return out
}

func write(path string, titles map[string]title) error {
	ids := make([]string, 0, len(titles))
	for id := range titles {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	ordered := make(map[string]title, len(titles))
	for _, id := range ids {
		ordered[id] = titles[id]
	}
	doc := struct {
		ReadAt string           `json:"readAt"`
		Titles map[string]title `json:"titles"`
	}{ReadAt: time.Now().UTC().Format(time.RFC3339), Titles: ordered}

	raw, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(raw, '\n'), 0o644)
}
