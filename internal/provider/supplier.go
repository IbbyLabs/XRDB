package provider

import "sort"

// Several providers declare the same rating source. Four supply "imdb", and
// MDBList alone declares thirteen, so for most sources there is a dedicated
// supplier and an aggregator holding a copy of the same figure.
//
// Which one a render used to show was decided by the alphabet: the registry
// sorts by name and the first answer for a source won. Cinemeta supplied "imdb"
// because of its C, ahead of the local dataset that answers from disk.
//
// The rule now is dedication. A provider that declares fewer sources is closer
// to the figure it reports and is usually cheaper, so it is preferred, and
// MDBList comes last everywhere by the same measure.

// explicitSupplierOrder pins the order where dedication cannot decide it,
// because two suppliers declare the same number of sources.
var explicitSupplierOrder = map[string][]string{
	"imdb": {"imdb_local", "omdb", "cinemeta", "mdblist"},
}

// FreeToAsk is implemented by a provider that answers without a network call,
// from memory or from a local dataset. Asking one costs nothing, so a render
// can find out whether it has a title before spending a request on a supplier
// it would otherwise have replaced.
//
// Declared by the provider rather than listed by the caller: a local source
// added later gets the behaviour without anyone remembering to name it.
type FreeToAsk interface {
	FreeToAsk() bool
}

// AsksNothing reports whether prov can be consulted for free.
func AsksNothing(prov Provider) bool {
	f, ok := prov.(FreeToAsk)
	return ok && f.FreeToAsk()
}

// Supplier describes a provider offering to answer for a source.
type Supplier struct {
	Name     string // provider name
	Declares int    // how many sources the provider declares
}

// supplierRank orders suppliers of one source, best first. Lower is better.
func supplierRank(source string, s Supplier) (int, bool) {
	for i, name := range explicitSupplierOrder[source] {
		if name == s.Name {
			return i, true
		}
	}
	return s.Declares, false
}

// RankSuppliers orders the given suppliers of one source, best first. A source
// with an explicit order follows it, and anything not named in that order sorts
// after the ones that are, by how many sources it declares. Ties break on name
// so the result does not depend on the order they were offered.
func RankSuppliers(source string, suppliers []Supplier) []Supplier {
	out := append([]Supplier(nil), suppliers...)
	sort.SliceStable(out, func(i, j int) bool {
		ri, expliciti := supplierRank(source, out[i])
		rj, explicitj := supplierRank(source, out[j])
		if expliciti != explicitj {
			return expliciti
		}
		if ri != rj {
			return ri < rj
		}
		return out[i].Name < out[j].Name
	})
	return out
}

// PreferredSupplier names the best supplier of source among those given, or ""
// when none supply it.
func PreferredSupplier(source string, suppliers []Supplier) string {
	ranked := RankSuppliers(source, suppliers)
	if len(ranked) == 0 {
		return ""
	}
	return ranked[0].Name
}
