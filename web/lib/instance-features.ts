'use client';

import { useEffect, useState } from 'react';
import { fetchHealth } from '@/lib/api';

export type InstanceFeatures = Record<string, boolean>;

/** Features the serving instance reports on healthz. Undefined until read, and
 *  undefined for good when the read fails or the instance predates the field. */
export function useInstanceFeatures(): InstanceFeatures | undefined {
  const [features, setFeatures] = useState<InstanceFeatures>();
  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then(h => { if (!cancelled && h.features) setFeatures(h.features); })
      .catch(() => { /* unreadable healthz: every control stays live */ });
    return () => { cancelled = true; };
  }, []);
  return features;
}
