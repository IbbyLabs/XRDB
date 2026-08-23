package main

import (
	"context"
	"strings"
	"testing"

	"xrdb_rewrite/internal/provider"
)

// stubProvider stands in for a rating provider at startup. Only its name and
// declared sources are read here.
type stubProvider struct {
	name    string
	sources []string
}

func (s stubProvider) Name() string { return s.name }

func (s stubProvider) Fetch(context.Context, string, string) (*provider.MediaMeta, error) {
	return nil, nil
}

func (s stubProvider) RatingSources() []string { return s.sources }

func registryOf(providers ...provider.Provider) *provider.Registry {
	reg := provider.NewRegistry()
	for _, p := range providers {
		reg.Register(p)
	}
	return reg
}

func TestASourceAnotherReadyProviderServesIsNotReportedLost(t *testing.T) {
	// The case that sent a self-hoster after a Trakt key: MDBList declares
	// trakt too, so a Trakt rating still renders with no Trakt credential.
	reg := registryOf(
		stubProvider{name: "mdblist", sources: []string{"imdb", "trakt", "metacritic"}},
		stubProvider{name: "trakt", sources: []string{"trakt"}},
	)
	lost := sourcesOnlyWaitingProvidersServe(reg, []string{"mdblist"}, []string{"trakt"})
	if len(lost) != 0 {
		t.Fatalf("expected no lost sources, got %v", lost)
	}
}

func TestASourceNothingElseServesIsReportedLost(t *testing.T) {
	reg := registryOf(
		stubProvider{name: "mdblist", sources: []string{"imdb", "trakt"}},
		stubProvider{name: "mediux", sources: []string{"mediux"}},
	)
	lost := sourcesOnlyWaitingProvidersServe(reg, []string{"mdblist"}, []string{"mediux"})
	if strings.Join(lost, ",") != "mediux" {
		t.Fatalf("expected mediux, got %v", lost)
	}
}

func TestLostSourcesAreDeduplicatedAndSorted(t *testing.T) {
	reg := registryOf(
		stubProvider{name: "a", sources: []string{"zeta", "alpha"}},
		stubProvider{name: "b", sources: []string{"alpha"}},
	)
	lost := sourcesOnlyWaitingProvidersServe(reg, nil, []string{"a", "b"})
	if strings.Join(lost, ",") != "alpha,zeta" {
		t.Fatalf("expected alpha,zeta, got %v", lost)
	}
}

func TestAProviderDeclaringNoSourcesContributesNothing(t *testing.T) {
	reg := registryOf(stubProvider{name: "quiet"})
	if lost := sourcesOnlyWaitingProvidersServe(reg, nil, []string{"quiet"}); len(lost) != 0 {
		t.Fatalf("expected no lost sources, got %v", lost)
	}
}
