import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';

import { filterBins, filterSkus, type LabelBinQuery, type LabelSkuQuery } from '../lib/filters';
import { LABELS_BASE } from './useLabelSettings';
import type { LabelBin, LabelSku } from '../types';

/**
 * Both hooks below follow the same shape: ask the labels endpoint, and if it is
 * not there, scope the caller's in-memory list instead.
 *
 * That fallback is not defensive padding — the pages that open this dialog
 * (MappingPage, SKUMaster) have already loaded every bin and every SKU for the
 * current warehouse in order to render themselves. Reusing that list means the
 * print dialog is useful the moment it ships, on a backend that has not grown
 * `/api/v1/labels/*` yet, and stays correct once it has.
 */
interface FallbackResult<T> {
  items: T[];
  /** True when the list came from the caller rather than the labels endpoint. */
  usedFallback: boolean;
}

function unwrapList(data: unknown): unknown[] | null {
  const payload =
    data && typeof data === 'object' && 'data' in (data as Record<string, unknown>)
      ? (data as Record<string, unknown>).data
      : data;
  return Array.isArray(payload) ? payload : null;
}

export function useLabelBins(
  query: LabelBinQuery,
  fallback: LabelBin[],
  enabled = true,
): { data: FallbackResult<LabelBin>; isLoading: boolean } {
  const { isAuthenticated } = useAuth();

  const result = useQuery({
    queryKey: ['label-bins', query],
    queryFn: async (): Promise<LabelBin[] | null> => {
      try {
        const { data } = await api.get(`${LABELS_BASE}/bins`, {
          params: { ...query, binIds: query.binIds?.join(',') || undefined },
        });
        const list = unwrapList(data);
        // Mock mode answers an unknown route with `[]`; so does a real endpoint
        // with nothing to return. Treating an empty list as "endpoint absent"
        // would be wrong in the second case, so only a non-array — i.e. a shape
        // that is not the contract — counts as absent.
        return list ? (list as LabelBin[]) : null;
      } catch {
        return null;
      }
    },
    enabled: isAuthenticated && enabled,
    staleTime: 60 * 1000,
  });

  const remote = result.data;
  // Memoised: the caller re-derives `fallback` from a list of thousands of
  // rows, and an unstable array identity here would re-run every downstream
  // useMemo (label items, counts, the preview) on every keystroke.
  const scopedFallback = useMemo(() => filterBins(fallback, query), [fallback, query]);

  const useRemote = Boolean(remote && remote.length > 0);
  return {
    data: {
      items: useRemote ? (remote as LabelBin[]) : scopedFallback,
      usedFallback: !useRemote,
    },
    isLoading: result.isLoading,
  };
}

export function useLabelSkus(
  query: LabelSkuQuery,
  fallback: LabelSku[],
  enabled = true,
): { data: FallbackResult<LabelSku>; isLoading: boolean } {
  const { isAuthenticated } = useAuth();

  const result = useQuery({
    queryKey: ['label-skus', query],
    queryFn: async (): Promise<LabelSku[] | null> => {
      try {
        const { data } = await api.get(`${LABELS_BASE}/skus`, {
          params: { ...query, skuIds: query.skuIds?.join(',') || undefined },
        });
        const list = unwrapList(data);
        return list ? (list as LabelSku[]) : null;
      } catch {
        return null;
      }
    },
    enabled: isAuthenticated && enabled,
    staleTime: 60 * 1000,
  });

  const remote = result.data;
  // Memoised: the caller re-derives `fallback` from a list of thousands of
  // rows, and an unstable array identity here would re-run every downstream
  // useMemo (label items, counts, the preview) on every keystroke.
  const scopedFallback = useMemo(() => filterSkus(fallback, query), [fallback, query]);

  const useRemote = Boolean(remote && remote.length > 0);
  return {
    data: {
      items: useRemote ? (remote as LabelSku[]) : scopedFallback,
      usedFallback: !useRemote,
    },
    isLoading: result.isLoading,
  };
}
