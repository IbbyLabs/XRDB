package profile

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// TraktAuth is a profile's Trakt account link: the OAuth tokens once linked,
// and the device code while a link is being made. It is stored sealed, beside
// the profile rather than in it, so it never reaches the config, an export or
// any response.
type TraktAuth struct {
	AccessToken  string `json:"accessToken,omitempty"`
	RefreshToken string `json:"refreshToken,omitempty"`
	// ExpiresAt is when the access token stops working, in unix seconds.
	ExpiresAt int64 `json:"expiresAt,omitempty"`
	// IssuedAt is when Trakt issued the access token, in unix seconds.
	IssuedAt int64 `json:"issuedAt,omitempty"`
	// NeedsRelink is set when Trakt refused the refresh token, so the owner
	// has to link again.
	NeedsRelink bool `json:"needsRelink,omitempty"`

	DeviceCode      string `json:"deviceCode,omitempty"`
	DeviceExpiresAt int64  `json:"deviceExpiresAt,omitempty"`
	DeviceInterval  int    `json:"deviceInterval,omitempty"`
}

// Linked reports whether the link holds a usable token pair.
func (a *TraktAuth) Linked() bool {
	return a != nil && a.AccessToken != "" && a.RefreshToken != ""
}

// empty reports whether there is nothing worth storing.
func (a *TraktAuth) empty() bool {
	return a == nil || (a.AccessToken == "" && a.RefreshToken == "" && a.DeviceCode == "" && !a.NeedsRelink)
}

// TraktAuth reads the profile's Trakt link. A profile with none, or one whose
// sealed value cannot be opened, returns nil with no error.
func (s *Store) TraktAuth(id string) (*TraktAuth, error) {
	var stored string
	err := s.db.QueryRow(`SELECT trakt_auth FROM profiles WHERE id = ?`, id).Scan(&stored)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("read trakt link: %w", err)
	}
	plain := s.openSecret(stored)
	if plain == "" {
		return nil, nil
	}
	var a TraktAuth
	if err := json.Unmarshal([]byte(plain), &a); err != nil {
		return nil, nil
	}
	if a.empty() {
		return nil, nil
	}
	return &a, nil
}

// SetTraktAuth stores the profile's Trakt link; nil clears it. It leaves
// updated_at alone: a link is not an edit of the look.
func (s *Store) SetTraktAuth(id string, a *TraktAuth) error {
	sealed := ""
	if !a.empty() {
		b, err := json.Marshal(a)
		if err != nil {
			return fmt.Errorf("encode trakt link: %w", err)
		}
		sealed, err = s.sealSecret(string(b))
		if err != nil {
			return err
		}
	}
	res, err := s.db.Exec(`UPDATE profiles SET trakt_auth = ? WHERE id = ?`, sealed, id)
	if err != nil {
		return fmt.Errorf("store trakt link: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
