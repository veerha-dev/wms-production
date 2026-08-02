import { useQuery } from '@tanstack/react-query';

import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';

import { DEFAULT_LABEL_SETTINGS } from '../constants';
import { normaliseLabelSettings } from '../lib/settings';
import type { LabelSettings } from '../types';

export const LABELS_BASE = '/api/v1/labels';

/**
 * The pre-existing endpoint behind Settings → Masters → Barcode & Labels.
 * `GET /api/v1/labels/settings` is the endpoint this feature is specified
 * against, but it serves the same five columns from the same `barcode_settings`
 * row, so falling back to it means the print dialog works against a deployment
 * whose backend has not shipped the labels module yet.
 */
const MASTERS_BARCODE_SETTINGS = '/api/v1/settings/masters/barcode-settings';

function unwrap(data: unknown): unknown {
  if (data && typeof data === 'object' && 'data' in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>).data;
  }
  return data;
}

export async function fetchLabelSettings(): Promise<LabelSettings> {
  for (const url of [`${LABELS_BASE}/settings`, MASTERS_BARCODE_SETTINGS]) {
    try {
      const { data } = await api.get(url);
      const payload = unwrap(data);
      // A 404 handled as an empty array (mock mode) or a body of the wrong
      // shape is not an answer — keep trying the next source.
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return normaliseLabelSettings(payload);
      }
    } catch {
      // Endpoint missing or unauthorised — try the next one, then the defaults.
    }
  }
  return DEFAULT_LABEL_SETTINGS;
}

/**
 * Tenant label defaults. Never errors: a print dialog that cannot open because
 * a settings endpoint is down is worse than one that opens on the documented
 * defaults and lets the operator override them for the run.
 */
export function useLabelSettings() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['label-settings'],
    queryFn: fetchLabelSettings,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_LABEL_SETTINGS,
  });
}
