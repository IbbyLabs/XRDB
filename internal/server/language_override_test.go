package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"xrdb_rewrite/internal/config"
)

// A render never fails on a bad parameter, so a rejected language is only
// visible in the header and the log. Without the accepted case beside it the
// test would pass on a handler that set the header unconditionally.
func TestARejectedLanguageIsAnnouncedInAHeader(t *testing.T) {
	for _, tc := range []struct {
		name string
		lang string
		want string
	}{
		{name: "malformed", lang: "english", want: "ignored"},
		{name: "unbounded", lang: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", want: "ignored"},
		{name: "accepted code", lang: "fr", want: ""},
		{name: "accepted with region", lang: "es-MX", want: ""},
		{name: "accepted token", lang: "original", want: ""},
		{name: "absent", lang: "", want: ""},
	} {
		// Both spellings, so accepting only one leaves the other silent and this
		// test says so rather than passing on the half that works.
		for _, param := range []string{"lang", "language"} {
			t.Run(param+"/"+tc.name, func(t *testing.T) {
				h := NewHandler("test", nil, nil, nil, nil, config.Config{})
				url := "/poster/tt0816692"
				if tc.lang != "" {
					url += "?" + param + "=" + tc.lang
				}
				rr := httptest.NewRecorder()
				h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, url, nil))

				if got := rr.Header().Get("X-Render-Language"); got != tc.want {
					t.Errorf("X-Render-Language = %q, want %q (status %d)", got, tc.want, rr.Code)
				}
			})
		}
	}
}
