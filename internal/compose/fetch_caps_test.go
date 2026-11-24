package compose

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/png"
	"io"
	"net/http"
	"strings"
	"testing"
)

// hugePNGHeader is a PNG whose header claims w x h with no pixel data behind it.
func hugePNGHeader(w, h uint32) []byte {
	var ihdr bytes.Buffer
	_ = binary.Write(&ihdr, binary.BigEndian, w)
	_ = binary.Write(&ihdr, binary.BigEndian, h)
	ihdr.Write([]byte{8, 6, 0, 0, 0})
	var out bytes.Buffer
	out.Write([]byte("\x89PNG\r\n\x1a\n"))
	_ = binary.Write(&out, binary.BigEndian, uint32(ihdr.Len()))
	chunk := append([]byte("IHDR"), ihdr.Bytes()...)
	out.Write(chunk)
	_ = binary.Write(&out, binary.BigEndian, crc32.ChecksumIEEE(chunk))
	return out.Bytes()
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func okResponse(body []byte) *http.Response {
	return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(body)), Header: http.Header{}}
}

func TestDecodeImageRefusesHugeDeclaredDimensions(t *testing.T) {
	_, err := decodeImage(hugePNGHeader(100000, 100000))
	if !errors.Is(err, errImageTooLarge) {
		t.Fatalf("err %v, want the pixel cap refusal", err)
	}
}

func TestDecodeImageAcceptsOrdinaryImage(t *testing.T) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewNRGBA(image.Rect(0, 0, 8, 8))); err != nil {
		t.Fatal(err)
	}
	if _, err := decodeImage(buf.Bytes()); err != nil {
		t.Fatalf("ordinary image refused: %v", err)
	}
}

func fetchLogoVia(t *testing.T, path string, body []byte) *image.NRGBA {
	t.Helper()
	old := logoClient
	logoClient = &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return okResponse(body), nil
	})}
	t.Cleanup(func() { logoClient = old; logoCache.Delete(path) })
	logoCache.Delete(path)
	return fetchProviderLogo(path)
}

func TestFetchProviderLogoRefusesHugeDimensions(t *testing.T) {
	if got := fetchLogoVia(t, "/huge-dims.png", hugePNGHeader(100000, 100000)); got != nil {
		t.Error("a logo declaring 10 gigapixels was decoded")
	}
}

func TestFetchProviderLogoRefusesOversizeBody(t *testing.T) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewNRGBA(image.Rect(0, 0, 4, 4))); err != nil {
		t.Fatal(err)
	}
	padded := append(buf.Bytes(), bytes.Repeat([]byte{0}, maxLogoBytes)...)
	if got := fetchLogoVia(t, "/oversize.png", padded); got != nil {
		t.Error("an over-cap logo body was accepted")
	}
	if got := fetchLogoVia(t, "/ok.png", buf.Bytes()); got == nil {
		t.Error("an ordinary logo was refused")
	}
}

func TestMediuxTokenOnlyGoesToTheAssetHost(t *testing.T) {
	cases := map[string]bool{
		"https://images.mediux.io/files/a.jpg":          true,
		"https://IMAGES.mediux.io:443/files/a.jpg":      true,
		"https://evilmediux.com/images.mediux.io":       false,
		"https://images.mediux.io.evil.net/a.jpg":       false,
		"https://mediux.com.evil.net/a.jpg":             false,
		"https://evil.example/a.jpg?x=images.mediux.io": false,
		"https://evil.example/images.mediux.io/a.jpg":   false,
		"https://user@evil.example/#images.mediux.io":   false,
	}
	for u, want := range cases {
		if got := isMediuxAssetURL(u); got != want {
			t.Errorf("isMediuxAssetURL(%q) = %v, want %v", u, got, want)
		}
	}
}

func TestFetchRemoteSendsNoMediuxTokenToOtherHosts(t *testing.T) {
	var auth []string
	f := &httpFetcher{
		mediuxKey: "secret-token",
		client: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			auth = append(auth, r.Header.Get("Authorization"))
			return okResponse([]byte("x")), nil
		})},
	}
	for _, u := range []string{"https://evilmediux.com/a.jpg", "https://mediux.com.evil.net/a.jpg", "https://images.mediux.io/a.jpg"} {
		if _, err := f.fetchRemote(context.Background(), u); err != nil {
			t.Fatal(err)
		}
	}
	if auth[0] != "" || auth[1] != "" {
		t.Errorf("a look-alike host received the token: %q", auth[:2])
	}
	if !strings.HasPrefix(auth[2], "Bearer ") {
		t.Errorf("the MediUX host got no token: %q", auth[2])
	}
}
