package provider

import (
	"net/url"

	"xrdb_rewrite/internal/logging"
)

// redactHTTPErr strips credentials out of a transport error before it travels
// any further. net/http builds its errors around the request URL, and several
// of these APIs take their key as a query parameter, so the raw error carries
// the key into whatever logs it.
func redactHTTPErr(err error) error {
	ue, ok := err.(*url.Error)
	if !ok {
		return err
	}
	parsed, perr := url.Parse(ue.URL)
	if perr != nil {
		// Unparseable: drop the URL rather than risk passing the key along.
		return &url.Error{Op: ue.Op, URL: "", Err: ue.Err}
	}
	parsed.RawQuery = logging.RedactQuery(parsed.RawQuery)
	return &url.Error{Op: ue.Op, URL: parsed.String(), Err: ue.Err}
}
