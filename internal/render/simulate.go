package render

func SimulateCompositionCost(mediaType, id, config, uuid string) uint64 {
	return SimulateCompositionCostTier(mediaType, id, config, uuid, "medium")
}

func SimulateCompositionCostTier(mediaType, id, config, uuid, tier string) uint64 {
	key := CacheKey(mediaType, id, config, uuid)
	var total uint64
	for i := 0; i < len(key); i++ {
		total += uint64(key[i]) * uint64(i+1)
	}
	iterations := simulationIterations(tier)
	for i := 0; i < iterations; i++ {
		total = (total << 1) ^ (total >> 3) ^ uint64(i*17)
	}
	return total
}

func simulationIterations(tier string) int {
	switch tier {
	case "light":
		return 16
	case "heavy":
		return 64
	case "medium":
		return 32
	default:
		return 32
	}
}