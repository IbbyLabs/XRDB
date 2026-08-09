package server

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

// Export sent the render key and not the profile password, so it answered 401 on
// every protected profile and the client blamed a missing instance API key. The
// gate is server-side and the header is client-side, so nothing failed until a
// user with a password pressed the button.
//
// Routes that create or import do not read an existing profile and so have no
// password to send. Anything else reaching /profile/ must send one; a new call
// that is neither listed here nor sending the header fails this test rather than
// reaching a user.
var profileCallsWithoutAPassword = map[string]string{
	"createProfile":  "writes a new profile; there is no stored password yet",
	"importProfiles": "writes profiles from an envelope; reads none",
}

func TestEveryProfileReadSendsThePassword(t *testing.T) {
	const src = "../../web/lib/api.ts"

	data, err := os.ReadFile(src)
	if err != nil {
		t.Skipf("client source not available: %v", err)
	}

	// Each exported async function up to the closing brace of its fetch options.
	fn := regexp.MustCompile(`(?s)export async function (\w+)\([^)]*\)[^{]*\{(.*?)\n\}`)
	matches := fn.FindAllSubmatch(data, -1)
	if len(matches) == 0 {
		t.Fatalf("no exported functions parsed from %s", src)
	}

	checked := 0
	for _, m := range matches {
		name, body := string(m[1]), string(m[2])
		if !strings.Contains(body, "/profile") {
			continue
		}
		checked++
		if why, ok := profileCallsWithoutAPassword[name]; ok {
			if strings.Contains(body, "profilePasswordHeaders") {
				t.Errorf("%s is listed as sending no password (%s) but sends one", name, why)
			}
			continue
		}
		if !strings.Contains(body, "profilePasswordHeaders") {
			t.Errorf("%s reaches a profile route without sending the profile password", name)
		}
	}

	// Without this the test passes when the regex stops matching anything.
	if checked < 4 {
		t.Fatalf("only %d profile calls found in %s; the parse is wrong", checked, src)
	}
}

// A 401 on a route that reads a profile can mean the password or the key, so
// naming one is a guess. Only routes that cannot involve a password may say so.
func TestOnlyPasswordlessRoutesBlameTheAPIKey(t *testing.T) {
	const src = "../../web/lib/api.ts"

	data, err := os.ReadFile(src)
	if err != nil {
		t.Skipf("client source not available: %v", err)
	}

	fn := regexp.MustCompile(`(?s)export async function (\w+)\([^)]*\)[^{]*\{(.*?)\n\}`)
	blamed := 0
	for _, m := range fn.FindAllSubmatch(data, -1) {
		name, body := string(m[1]), string(m[2])
		if !strings.Contains(body, "NEEDS_RENDER_KEY") {
			continue
		}
		blamed++
		if _, ok := profileCallsWithoutAPassword[name]; !ok {
			t.Errorf("%s blames the API key for a 401 that a profile password can also cause", name)
		}
	}
	if blamed == 0 {
		t.Fatal("NEEDS_RENDER_KEY is used nowhere; the parse is wrong")
	}
}
