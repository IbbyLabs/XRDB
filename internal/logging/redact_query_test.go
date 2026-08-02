package logging

import (
	"net/url"
	"strings"
	"testing"
)

// Every credential XRDB accepts, in the shape it arrives on the wire. A list of
// exact parameter names passed the two it had been told about and wrote the
// rest to the access log verbatim, so this asserts the rule rather than the
// list: nothing whose name reads like a credential survives.
func TestNoProviderCredentialSurvivesTheAccessLog(t *testing.T) {
	const secret = "sk-live-do-not-log-me"
	for _, name := range []string{
		"mdblistKey", "tmdbKey", "fanartKey", "omdbKey", "xrdbKey",
		"simklClientId", "traktClientId",
		"key", "apikey", "api_key", "token", "password", "admin_key", "client_secret",
		// Not parameters today. The rule is meant to hold for ones nobody has
		// invented yet, and each costs a word.
		"sig", "signature", "hmac", "session", "cookie", "bearer",
	} {
		q := url.Values{name: {secret}, "id": {"tt0118615"}}
		got := RedactQuery(q.Encode())
		if strings.Contains(got, secret) {
			t.Errorf("%s reached the log in full: %s", name, got)
		}
		if !strings.Contains(got, "tt0118615") {
			t.Errorf("%s took the rest of the query with it: %s", name, got)
		}
	}
}

// A v2 profile keeps its credentials inside the config blob, so a parameter
// with an innocent name still carries one.
func TestACredentialInsideTheConfigBlobIsRedacted(t *testing.T) {
	const secret = "sk-live-do-not-log-me"
	q := url.Values{"config": {`{"mdblistKey":"` + secret + `","genre":true}`}}
	got := RedactQuery(q.Encode())
	if strings.Contains(got, secret) {
		t.Errorf("a credential inside config reached the log: %s", got)
	}
	decoded, err := url.ParseQuery(got)
	if err != nil {
		t.Fatalf("the redacted query no longer parses: %v", err)
	}
	if !strings.Contains(decoded.Get("config"), `"genre":true`) {
		t.Errorf("redacting the credential lost the rest of the config: %s", decoded.Get("config"))
	}
}

// Redacting by fragment must not eat an ordinary parameter.
func TestOrdinaryParametersSurvive(t *testing.T) {
	q := url.Values{"keywords": {"space opera"}, "type": {"movie"}, "cb": {"91"}}
	got := RedactQuery(q.Encode())
	for _, want := range []string{"space+opera", "movie", "91"} {
		if !strings.Contains(got, want) {
			t.Errorf("%q was redacted but carries nothing secret: %s", want, got)
		}
	}
}
