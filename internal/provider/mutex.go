package provider

import "sync"

// cacheMu is an alias so the cache struct stays readable.
type cacheMu = sync.Mutex
