/**
 * Notification System — data layer (Workstream C).
 *
 * REST-backed + persistent, augmented by the authenticated socket.io channel:
 *   - `useNotifications(filters)`  paginated list
 *   - `useUnreadCount()`           bell badge (30s poll fallback if the socket drops)
 *   - `useMarkRead()` / `useMarkAllRead()` / `useNotificationAction()`
 *   - `useNotificationSocket()`    live `notification` events pushed straight into
 *                                  the React Query cache — no refetch per event.
 */
import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { api, getAccessToken } from '@/shared/lib/api';
import { useAuth } from '@/shared/contexts/AuthContext';
import { usePreferences } from '@/features/settings/hooks/useSettings';
import {
  matchesNotificationFilters,
  type Notification,
  type NotificationFilters,
  type NotificationListResult,
} from '@/features/notifications/types';

export type {
  Notification,
  NotificationFilters,
  NotificationListResult,
} from '@/features/notifications/types';

// ─── Query keys ───────────────────────────────────────────────────────────────

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => ['notifications', 'list'] as const,
  list: (filters: NotificationFilters) => ['notifications', 'list', filters] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
};

const PANEL_LIMIT = 15;

// ─── List ─────────────────────────────────────────────────────────────────────

export function useNotifications(filters: NotificationFilters = {}) {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: notificationKeys.list(filters),
    queryFn: async (): Promise<NotificationListResult> => {
      const params: Record<string, any> = {};
      if (filters.category) params.category = filters.category;
      if (filters.unread) params.unread = true;
      if (filters.requiresAction) params.requiresAction = true;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.search) params.search = filters.search;
      params.page = filters.page ?? 1;
      params.limit = filters.limit ?? 20;

      const { data } = await api.get('/api/v1/notifications', { params });
      const rows: Notification[] = Array.isArray(data?.data) ? data.data : [];
      return {
        data: rows,
        meta: {
          total: data?.meta?.total ?? rows.length,
          page: data?.meta?.page ?? params.page,
          limit: data?.meta?.limit ?? params.limit,
          totalPages: data?.meta?.totalPages ?? 1,
        },
      };
    },
    enabled: isAuthenticated,
    staleTime: 15_000,
  });
}

/** The bell panel: latest 15, newest first. */
export function usePanelNotifications() {
  return useNotifications({ page: 1, limit: PANEL_LIMIT });
}

// ─── Unread count ─────────────────────────────────────────────────────────────

export function useUnreadCount() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: async (): Promise<number> => {
      const { data } = await api.get('/api/v1/notifications/unread-count');
      return Number(data?.data?.count ?? 0);
    },
    enabled: isAuthenticated,
    // Fallback so the badge still moves when the socket is down.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

function bumpUnreadCount(qc: QueryClient, delta: number) {
  qc.setQueryData(notificationKeys.unreadCount(), (old: number | undefined) =>
    Math.max(0, (old ?? 0) + delta)
  );
}

function patchCachedNotification(
  qc: QueryClient,
  id: string,
  patch: Partial<Notification>
) {
  qc.getQueryCache()
    .findAll({ queryKey: notificationKeys.lists() })
    .forEach((query) => {
      qc.setQueryData(query.queryKey, (old: NotificationListResult | undefined) => {
        if (!old?.data) return old;
        if (!old.data.some((n) => n.id === id)) return old;
        return {
          ...old,
          data: old.data.map((n) => (n.id === id ? { ...n, ...patch } : n)),
        };
      });
    });
}

export function useMarkRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/notifications/${id}/read`),
    onMutate: (id: string) => {
      // Optimistic: the tint should drop the instant the row is clicked.
      const wasUnread = qc
        .getQueryCache()
        .findAll({ queryKey: notificationKeys.lists() })
        .some((q) => {
          const d = qc.getQueryData<NotificationListResult>(q.queryKey);
          return d?.data?.some((n) => n.id === id && !n.isRead) ?? false;
        });
      patchCachedNotification(qc, id, { isRead: true, readAt: new Date().toISOString() });
      if (wasUnread) bumpUnreadCount(qc, -1);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.lists() });
      qc.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => api.post('/api/v1/notifications/read-all'),
    onSuccess: () => {
      qc.setQueryData(notificationKeys.unreadCount(), 0);
      toast.success('All notifications marked as read');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || 'Failed to mark notifications as read'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.lists() });
      qc.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

export interface NotificationActionInput {
  id: string;
  action: 'approve' | 'reject';
  reason?: string;
}

/** Inline approve/reject from the Approvals inbox (spec Part 4). */
export function useNotificationAction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, action, reason }: NotificationActionInput) =>
      api
        .post(`/api/v1/notifications/${id}/action`, { action, ...(reason ? { reason } : {}) })
        .then((r: any) => r.data?.data),
    onSuccess: (_data, vars) => {
      patchCachedNotification(qc, vars.id, {
        actionState: vars.action === 'approve' ? 'approved' : 'rejected',
        isRead: true,
      });
      toast.success(vars.action === 'approve' ? 'Approved' : 'Rejected');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Action failed'),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.lists() });
      qc.invalidateQueries({ queryKey: notificationKeys.unreadCount() });
    },
  });
}

// ─── Sound (WebAudio, no asset, no dependency) ────────────────────────────────

let audioCtx: AudioContext | null = null;

function playNotificationBeep() {
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1174.66, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    /* audio is best-effort — never break the UI over a beep */
  }
}

// ─── Socket → cache → badge ───────────────────────────────────────────────────

/**
 * Subscribes to the authenticated `/inventory` namespace (backend auto-joins the
 * `user-{id}` room on handshake) and folds each `notification` event into the
 * React Query cache directly. Mount ONCE — it lives in <NotificationCenter />.
 */
export function useNotificationSocket() {
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { data: prefs } = usePreferences();
  const soundEnabled = !!prefs?.notifInappSound;
  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  useEffect(() => {
    if (!isAuthenticated) return;
    const token = getAccessToken();
    if (!token) return;

    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const socket: Socket = io(`${API_BASE_URL}/inventory`, {
      withCredentials: true,
      auth: { token },
    });

    socket.on('notification', (incoming: Notification) => {
      if (!incoming?.id) return;

      const listQueries = qc.getQueryCache().findAll({ queryKey: notificationKeys.lists() });

      // Grouped notifications re-emit the SAME row id with a bumped groupCount —
      // treat a known id as an update, not a new arrival.
      const alreadyKnown = listQueries.some((q) => {
        const d = qc.getQueryData<NotificationListResult>(q.queryKey);
        return d?.data?.some((n) => n.id === incoming.id) ?? false;
      });
      const alreadyUnread = listQueries.some((q) => {
        const d = qc.getQueryData<NotificationListResult>(q.queryKey);
        return d?.data?.some((n) => n.id === incoming.id && !n.isRead) ?? false;
      });

      listQueries.forEach((query) => {
        const key = query.queryKey as readonly unknown[];
        const filters = (key[2] ?? {}) as NotificationFilters;
        const page = filters.page ?? 1;

        qc.setQueryData(query.queryKey, (old: NotificationListResult | undefined) => {
          if (!old?.data) return old;

          if (old.data.some((n) => n.id === incoming.id)) {
            return {
              ...old,
              data: old.data.map((n) => (n.id === incoming.id ? { ...n, ...incoming } : n)),
            };
          }

          // Only page 1 gets prepends; deeper pages would shift rows incorrectly.
          if (page !== 1) return old;
          if (!matchesNotificationFilters(incoming, filters)) return old;

          const limit = filters.limit ?? old.meta.limit ?? 20;
          const total = old.meta.total + 1;
          return {
            data: [incoming, ...old.data].slice(0, limit),
            meta: {
              ...old.meta,
              total,
              totalPages: Math.max(1, Math.ceil(total / limit)),
            },
          };
        });
      });

      if (!incoming.isRead && !alreadyUnread) bumpUnreadCount(qc, 1);
      if (!alreadyKnown && soundRef.current) playNotificationBeep();
    });

    return () => {
      socket.off('notification');
      socket.disconnect();
    };
  }, [isAuthenticated, qc]);
}
