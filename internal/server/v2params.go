package server

import (
	"encoding/json"
	"strings"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/migrate"
)

// v2ConfigParams are the v2-era render parameters live clients still send.
// list says the value was a JSON array in a v2 config; a query string is flat
// text, so the shape has to be restored before the migration package can read
// it. lang is absent because the render route already reads it, tmdbKey because
// a credential does not belong in the config, and streamBadges because it gated
// a torrent-index lookup XRDB does unconditionally, so it has nothing to set.
var v2ConfigParams = []struct {
	name string
	list bool
}{
	{name: "imageText"},
	{name: "ratingStyle"},
	{name: "posterRatings", list: true},
	{name: "posterRatingsLayout"},
}

// applyV2QueryParams overlays onto cfg the v2 parameters present in raw, and
// reports which it applied. Only the fields a caller named are touched, so a
// URL asking for one setting says nothing about the rest.
//
// Values are translated by the migration package rather than here, so the v2
// spellings and their rating-source ids keep one owner.
func applyV2QueryParams(cfg *imageconfig.Config, raw, surface string) []string {
	if cfg == nil || raw == "" {
		return nil
	}
	fields := map[string]json.RawMessage{}
	var named []string
	for _, p := range v2ConfigParams {
		value := queryValue(raw, p.name, "")
		if value == "" {
			continue
		}
		encoded, err := encodeV2Value(value, p.list)
		if err != nil {
			continue
		}
		fields[p.name] = encoded
		named = append(named, p.name)
	}
	if len(named) == 0 {
		return nil
	}

	v2, err := json.Marshal(fields)
	if err != nil {
		return nil
	}
	converted, _, err := migrate.ConvertConfig(v2)
	if err != nil {
		return nil
	}
	over := imageconfig.ParseSurface(converted, surface)

	applied := named[:0:0]
	for _, name := range named {
		switch name {
		case "imageText":
			cfg.TextPreference = over.TextPreference
		case "ratingStyle":
			cfg.BadgeStyle = over.BadgeStyle
		case "posterRatings":
			cfg.Ratings = over.Ratings
		case "posterRatingsLayout":
			cfg.RatingsLayout = over.RatingsLayout
		default:
			continue
		}
		applied = append(applied, name)
	}
	return applied
}

// encodeV2Value restores the JSON shape a v2 config gave the value.
func encodeV2Value(value string, list bool) (json.RawMessage, error) {
	if !list {
		return json.Marshal(value)
	}
	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			items = append(items, part)
		}
	}
	return json.Marshal(items)
}
