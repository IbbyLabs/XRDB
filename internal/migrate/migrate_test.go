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
			"id":          json.RawMessage(`"tt0816692"`),
			"name":        json.RawMessage(`"Interstellar"`),
			"type":        json.RawMessage(`"poster"`),
			"uuid":        json.RawMessage(`"abc123"`),
			"config":      json.RawMessage(`{"layout":"compact","rating":"imdb"}`),
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
			"id":          json.RawMessage(`"tt0816692"`),
			"type":        json.RawMessage(`"poster"`),
			"config":      json.RawMessage(`{"layout":"compact"}`),
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

func TestMigrateClassifiesConfigFields(t *testing.T) {
	input := LegacyEnvelope{Profiles: []map[string]json.RawMessage{
		{
			"id":   json.RawMessage(`"p1"`),
			"type": json.RawMessage(`"poster"`),
			// "language" and "ratings" are modeled as they stand, "posterRatingsMax"
			// converts into the poster surface, and the aggregate colour has no
			// home yet so it is carried untouched.
			"config": json.RawMessage(`{"language":"en","ratings":["imdb"],"posterRatingsMax":4,"aggregateCriticsAccentColor":"#22c55e"}`),
		},
	}}

	_, report, err := MigrateLegacyProfiles(input, "src", time.Date(2026, 7, 16, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if report.MappedConfigFields != 3 {
		t.Errorf("mapped config fields = %d, want 3 (language, ratings, posterRatingsMax)", report.MappedConfigFields)
	}
	if report.ConvertedConfigSummary["posterRatingsMax"] != 1 {
		t.Errorf("posterRatingsMax not reported as converted: %v", report.ConvertedConfigSummary)
	}
	if report.DeferredConfigSummary["aggregateCriticsAccentColor"] != 1 {
		t.Errorf("aggregateCriticsAccentColor not reported as deferred: %v", report.DeferredConfigSummary)
	}
	if len(report.DeferredConfigFields) != 1 {
		t.Errorf("expected 1 deferred field, got %d", len(report.DeferredConfigFields))
	}
	// Deferred is transparency, not loss: the config blob is passed through whole.
	if report.DeferredConfigFields[0].Field != "aggregateCriticsAccentColor" {
		t.Errorf("deferred fields not sorted: %+v", report.DeferredConfigFields)
	}
}

func TestMigrateModeledOnlyConfigHasNoDeferrals(t *testing.T) {
	input := LegacyEnvelope{Profiles: []map[string]json.RawMessage{
		{
			"id":     json.RawMessage(`"p1"`),
			"type":   json.RawMessage(`"poster"`),
			"config": json.RawMessage(`{"language":"fr","badgeStyle":"glass"}`),
		},
	}}
	_, report, err := MigrateLegacyProfiles(input, "src", time.Now())
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if len(report.DeferredConfigFields) != 0 {
		t.Errorf("expected no deferrals, got %+v", report.DeferredConfigFields)
	}
	if report.MappedConfigFields != 2 {
		t.Errorf("mapped = %d, want 2", report.MappedConfigFields)
	}
}
