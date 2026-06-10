package migrate

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"
)

func TestMigrateLegacyProfilesSuccess(t *testing.T) {
	input := LegacyEnvelope{Profiles: []map[string]json.RawMessage{
		{
			"id":         json.RawMessage(`"tt0816692"`),
			"name":       json.RawMessage(`"Interstellar"`),
			"type":       json.RawMessage(`"poster"`),
			"uuid":       json.RawMessage(`"abc123"`),
			"config":     json.RawMessage(`{"layout":"compact","rating":"imdb"}`),
			"legacyField": json.RawMessage(`"dropped"`),
		},
	}}

	profiles, report, err := MigrateLegacyProfiles(input, "test-source", time.Date(2026, 5, 23, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(profiles) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(profiles))
	}
	if profiles[0].ID != "tt0816692" {
		t.Fatalf("expected migrated profile id")
	}
	if profiles[0].Version != 1 {
		t.Fatalf("expected version 1")
	}
	if report.MigratedProfiles != 1 || report.InputProfiles != 1 {
		t.Fatalf("expected report counts to be 1")
	}
	if report.UnsupportedSummary["legacyField"] != 1 {
		t.Fatalf("expected legacyField to be counted as unsupported")
	}
}

func TestMigrateLegacyProfilesFailFastOnMissingRequired(t *testing.T) {
	input := LegacyEnvelope{Profiles: []map[string]json.RawMessage{
		{
			"id":     json.RawMessage(`"tt0816692"`),
			"config": json.RawMessage(`{"layout":"compact"}`),
		},
	}}

	_, _, err := MigrateLegacyProfiles(input, "test-source", time.Now())
	if err == nil {
		t.Fatalf("expected error for missing required field")
	}
}

func TestMigrateLegacyProfilesDeterministic(t *testing.T) {
	input := LegacyEnvelope{Profiles: []map[string]json.RawMessage{
		{
			"id":         json.RawMessage(`"tt0816692"`),
			"type":       json.RawMessage(`"poster"`),
			"config":     json.RawMessage(`{"layout":"compact"}`),
			"legacyField": json.RawMessage(`"dropped"`),
		},
	}}
	now := time.Date(2026, 5, 23, 0, 0, 0, 0, time.UTC)

	p1, r1, err1 := MigrateLegacyProfiles(input, "test-source", now)
	if err1 != nil {
		t.Fatalf("expected no error, got %v", err1)
	}
	p2, r2, err2 := MigrateLegacyProfiles(input, "test-source", now)
	if err2 != nil {
		t.Fatalf("expected no error, got %v", err2)
	}
	if !reflect.DeepEqual(p1, p2) {
		t.Fatalf("expected deterministic profile output")
	}
	if !reflect.DeepEqual(r1, r2) {
		t.Fatalf("expected deterministic report output")
	}
}

func TestParseLegacyEnvelopeSupportsArrayAndEnvelope(t *testing.T) {
	arr := []byte(`[{"id":"tt0816692","type":"poster","config":{}}]`)
	env := []byte(`{"profiles":[{"id":"tt0816692","type":"poster","config":{}}]}`)

	if _, err := ParseLegacyEnvelope(arr); err != nil {
		t.Fatalf("expected array format to parse: %v", err)
	}
	if _, err := ParseLegacyEnvelope(env); err != nil {
		t.Fatalf("expected envelope format to parse: %v", err)
	}
}
