package server

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"xrdb_rewrite/internal/imageconfig"
	"xrdb_rewrite/internal/profile"
	"xrdb_rewrite/internal/provider"
	"xrdb_rewrite/internal/render"
)

// renderKeyParts is what a render's cache key carries beyond its config.
type renderKeyParts struct {
	id            string
	configParam   string
	profileLoaded bool
	contentType   string
	ownerKeyFP    string
	cacheBuster   string
}

// renderKeyInput is the config part of a render's cache key. The render handler
// and the cache warmer both build keys with it.
func renderKeyInput(imgCfg imageconfig.Config, k renderKeyParts) string {
	in := imageconfig.CacheKey(imgCfg)
	// A per-type override makes the render depend on the kind of title, so
	// the kind joins the key. Configs without one keep their existing keys.
	// A bare TMDB id joins it too: there the kind picks which endpoint
	// answers, so it selects the artwork rather than only styling it.
	if imageconfig.HasPerTypeRatings(imgCfg) || imageconfig.HasPerTypeArtwork(imgCfg) || idKindIsAmbiguous(k.id) {
		in += ":ct=" + k.contentType
	}
	// Without a profile, a fingerprint of configParam separates inline configs
	// without letting unbounded raw strings into the key.
	if !k.profileLoaded {
		h := sha256.Sum256([]byte(k.configParam))
		in += ":" + hex.EncodeToString(h[:8])
	}
	if k.ownerKeyFP != "" {
		in += ":pk=" + k.ownerKeyFP
	}
	if k.cacheBuster != "" {
		hcb := sha256.Sum256([]byte(k.cacheBuster))
		in += ":cb=" + hex.EncodeToString(hcb[:8])
	}
	return in
}

// noUUID is the uuid a render URL without one is keyed under.
const noUUID = "none"

// warmTarget is the config a warm pass renders with, as a request naming it
// would resolve it.
type warmTarget struct {
	cfg           imageconfig.Config
	configParam   string
	profileLoaded bool
	keys          map[string]string
	ownerKeyFP    string
}

// cacheKey is the key a plain render URL for id under this target looks up.
func (t warmTarget) cacheKey(mediaType, id string) string {
	return render.TypedCacheKey(mediaType, id, renderKeyInput(t.cfg, renderKeyParts{
		id: id, configParam: t.configParam, profileLoaded: t.profileLoaded, ownerKeyFP: t.ownerKeyFP,
	}), noUUID)
}

// resolveWarmTarget resolves name the way a render URL's config= does. An empty
// name takes the instance default profile, and failing that the built-in look.
func resolveWarmTarget(store *profile.Store, defaultProfile, name, surface string) (warmTarget, error) {
	if name == "" {
		name = defaultProfile
	}
	if name == "" {
		return warmTarget{cfg: imageconfig.Default(), configParam: "default"}, nil
	}
	if store == nil {
		return warmTarget{}, errors.New("no profile store")
	}
	p, err := store.Resolve(name)
	if err != nil {
		return warmTarget{}, fmt.Errorf("profile %q: %w", name, err)
	}
	t := warmTarget{cfg: imageconfig.ParseSurface(p.Config, surface), configParam: name, profileLoaded: true}
	if len(p.ProviderKeys) > 0 {
		t.keys = p.ProviderKeys
		t.ownerKeyFP = provider.KeysFingerprint(p.ProviderKeys)
	}
	return t, nil
}
