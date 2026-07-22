package migrate

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"xrdb_rewrite/internal/imageconfig"
)

type LegacyEnvelope struct {
	Profiles []map[string]json.RawMessage `json:"profiles"`
}

type OutputProfile struct {
	Version    int             `json:"version"`
	ID         string          `json:"id"`
	Name       string          `json:"name,omitempty"`
	Type       string          `json:"type"`
	UUID       string          `json:"uuid,omitempty"`
	Config     json.RawMessage `json:"config"`
	Source     string          `json:"source"`
	SourceLine int             `json:"sourceLine"`
}

// OutputEnvelope wraps the migrated profiles in the shape XRDB's own profile
// export and import use, so the file the migration writes is one a running
// instance accepts as-is.
type OutputEnvelope struct {
	Version  int             `json:"version"`
	Profiles []OutputProfile `json:"profiles"`
}

type UnsupportedField struct {
	ProfileIndex int    `json:"profileIndex"`
	Field        string `json:"field"`
	Reason       string `json:"reason"`
}

// DeferredField is a config key preserved on a migrated profile that XRDB does
// not yet render. Nothing is lost: the value stays on the profile and is served
// unchanged once the matching v3 control ships. Listing them turns silent
// omission into a visible, recoverable deferral.
type DeferredField struct {
	ProfileIndex int    `json:"profileIndex"`
	Field        string `json:"field"`
}

type MigrationReport struct {
	GeneratedAt        string             `json:"generatedAt"`
	InputProfiles      int                `json:"inputProfiles"`
	MigratedProfiles   int                `json:"migratedProfiles"`
	UnsupportedFields  []UnsupportedField `json:"unsupportedFields"`
	UnsupportedSummary map[string]int     `json:"unsupportedSummary"`
	// MappedConfigFields counts config keys XRDB renders today, across all
	// profiles. DeferredConfigFields lists the keys preserved but not yet
	// rendered, so a migrating user sees exactly what is carried over untouched.
	MappedConfigFields    int             `json:"mappedConfigFields"`
	DeferredConfigFields  []DeferredField `json:"deferredConfigFields"`
	DeferredConfigSummary map[string]int  `json:"deferredConfigSummary"`
	// ConvertedConfigFields counts v2 keys translated into the shape XRDB
	// renders from. They are also counted as mapped, since after conversion
	// they do render; the summary names them so a user can see what moved.
	ConvertedConfigFields  int            `json:"convertedConfigFields"`
	ConvertedConfigSummary map[string]int `json:"convertedConfigSummary"`
	// CredentialConfigFields names profiles still carrying a v2 API key in
	// their config. Nothing is removed; XRDB reads keys from its own settings,
	// so these can be cleared once the migration is confirmed.
	CredentialConfigFields []DeferredField `json:"credentialConfigFields,omitempty"`
}

// credentialFields are v2 config keys that held an API key or client id. v2
// kept them on the profile; XRDB reads credentials from its own settings
// instead. They are preserved like any other key, so a profile that carried a
// key still carries it — including into an export — which is worth telling the
// user about rather than deciding for them.
var credentialFields = map[string]struct{}{
	"tmdbKey":       {},
	"mdblistKey":    {},
	"fanartKey":     {},
	"simklClientId": {},
	"xrdbKey":       {},
	"omdbKey":       {},
	"traktClientId": {},
}

var requiredFields = []string{"id", "type", "config"}

var supportedFields = map[string]struct{}{
	"id":        {},
	"name":      {},
	"type":      {},
	"uuid":      {},
	"config":    {},
	"createdAt": {},
	"updatedAt": {},
}

func ParseLegacyEnvelope(data []byte) (LegacyEnvelope, error) {
	var envelope LegacyEnvelope
	if err := json.Unmarshal(data, &envelope); err == nil && envelope.Profiles != nil {
		return envelope, nil
	}

	var profiles []map[string]json.RawMessage
	if err := json.Unmarshal(data, &profiles); err == nil {
		return LegacyEnvelope{Profiles: profiles}, nil
	}

	return LegacyEnvelope{}, errors.New("failed to parse legacy input as envelope or profile array")
}

func MigrateLegacyProfiles(envelope LegacyEnvelope, source string, now time.Time) ([]OutputProfile, MigrationReport, error) {
	report := MigrationReport{
		GeneratedAt:            now.UTC().Format(time.RFC3339),
		InputProfiles:          len(envelope.Profiles),
		UnsupportedFields:      make([]UnsupportedField, 0),
		UnsupportedSummary:     make(map[string]int),
		DeferredConfigFields:   make([]DeferredField, 0),
		DeferredConfigSummary:  make(map[string]int),
		ConvertedConfigSummary: make(map[string]int),
	}

	out := make([]OutputProfile, 0, len(envelope.Profiles))
	for i, row := range envelope.Profiles {
		for _, field := range requiredFields {
			if _, ok := row[field]; !ok {
				return nil, report, fmt.Errorf("profile %d missing required field %q", i, field)
			}
		}

		id, err := unmarshalString(row["id"])
		if err != nil || id == "" {
			return nil, report, fmt.Errorf("profile %d has invalid id", i)
		}

		typ, err := unmarshalString(row["type"])
		if err != nil || typ == "" {
			return nil, report, fmt.Errorf("profile %d has invalid type", i)
		}

		config := bytes.TrimSpace(row["config"])
		if len(config) == 0 || config[0] != '{' {
			return nil, report, fmt.Errorf("profile %d has invalid config object", i)
		}
		var configCheck map[string]json.RawMessage
		if err := json.Unmarshal(config, &configCheck); err != nil {
			return nil, report, fmt.Errorf("profile %d has malformed config object", i)
		}
		// Translate v2's per-surface keys into the envelope XRDB renders from.
		// The original keys stay on the profile untouched, so this only ever
		// adds; a translation that goes wrong can lose nothing.
		converted, stats, err := ConvertConfig(config)
		if err != nil {
			return nil, report, fmt.Errorf("profile %d config could not be converted: %w", i, err)
		}
		config = converted
		convertedKeys := make(map[string]bool, len(stats.ConvertedFields))
		for _, key := range stats.ConvertedFields {
			convertedKeys[key] = true
			report.ConvertedConfigSummary[key]++
		}
		report.ConvertedConfigFields += stats.Converted

		// Classify every config key so the user sees which of their settings XRDB
		// renders today (mapped or converted) and which are carried over
		// untouched (deferred). The config blob itself is stored verbatim either
		// way — nothing is lost.
		for key := range configCheck {
			// A key that held a credential is flagged whether or not it also
			// renders, since the point is that it travels with the profile.
			if _, isCredential := credentialFields[key]; isCredential && !isEmptyJSON(configCheck[key]) {
				report.CredentialConfigFields = append(report.CredentialConfigFields, DeferredField{
					ProfileIndex: i,
					Field:        key,
				})
			}
			if imageconfig.IsModeledKey(key) || convertedKeys[key] {
				report.MappedConfigFields++
				continue
			}
			report.DeferredConfigFields = append(report.DeferredConfigFields, DeferredField{
				ProfileIndex: i,
				Field:        key,
			})
			report.DeferredConfigSummary[key]++
		}

		name := ""
		if v, ok := row["name"]; ok {
			name, err = unmarshalString(v)
			if err != nil {
				return nil, report, fmt.Errorf("profile %d has invalid name", i)
			}
		}

		uuid := ""
		if v, ok := row["uuid"]; ok {
			uuid, err = unmarshalString(v)
			if err != nil {
				return nil, report, fmt.Errorf("profile %d has invalid uuid", i)
			}
		}

		for key := range row {
			if _, ok := supportedFields[key]; ok {
				continue
			}
			report.UnsupportedFields = append(report.UnsupportedFields, UnsupportedField{
				ProfileIndex: i,
				Field:        key,
				Reason:       "field is not supported in the XRDB schema",
			})
			report.UnsupportedSummary[key]++
		}

		out = append(out, OutputProfile{
			Version:    1,
			ID:         id,
			Name:       name,
			Type:       typ,
			UUID:       uuid,
			Config:     config,
			Source:     source,
			SourceLine: i + 1,
		})
	}

	sort.Slice(report.UnsupportedFields, func(i, j int) bool {
		a := report.UnsupportedFields[i]
		b := report.UnsupportedFields[j]
		if a.ProfileIndex != b.ProfileIndex {
			return a.ProfileIndex < b.ProfileIndex
		}
		return a.Field < b.Field
	})
	sort.Slice(report.DeferredConfigFields, func(i, j int) bool {
		a := report.DeferredConfigFields[i]
		b := report.DeferredConfigFields[j]
		if a.ProfileIndex != b.ProfileIndex {
			return a.ProfileIndex < b.ProfileIndex
		}
		return a.Field < b.Field
	})

	report.MigratedProfiles = len(out)
	return out, report, nil
}

// isEmptyJSON reports whether a value is absent in every sense that matters
// here: null, or an empty string. A blank credential field is not one to warn
// about.
func isEmptyJSON(raw json.RawMessage) bool {
	trimmed := strings.TrimSpace(string(raw))
	return trimmed == "" || trimmed == "null" || trimmed == `""`
}

func unmarshalString(raw json.RawMessage) (string, error) {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return "", err
	}
	return s, nil
}
