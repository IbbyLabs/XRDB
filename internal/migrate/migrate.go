package migrate

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"
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

type UnsupportedField struct {
	ProfileIndex int    `json:"profileIndex"`
	Field        string `json:"field"`
	Reason       string `json:"reason"`
}

type MigrationReport struct {
	GeneratedAt        string             `json:"generatedAt"`
	InputProfiles      int                `json:"inputProfiles"`
	MigratedProfiles   int                `json:"migratedProfiles"`
	UnsupportedFields  []UnsupportedField `json:"unsupportedFields"`
	UnsupportedSummary map[string]int     `json:"unsupportedSummary"`
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
		GeneratedAt:        now.UTC().Format(time.RFC3339),
		InputProfiles:      len(envelope.Profiles),
		UnsupportedFields:  make([]UnsupportedField, 0),
		UnsupportedSummary: make(map[string]int),
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

	report.MigratedProfiles = len(out)
	return out, report, nil
}

func unmarshalString(raw json.RawMessage) (string, error) {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return "", err
	}
	return s, nil
}
