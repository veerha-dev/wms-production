import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { formatDistanceToNowStrict } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Activity } from 'lucide-react';
import { useAuth } from '@/shared/contexts/AuthContext';
import { getAccessToken } from '@/shared/lib/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface AuditEvent {
  tenantId: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  module: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  statusCode: number | null;
  createdAt: string;
}

const ACTION_BADGE: Record<string, string> = {
  create: 'bg-green-50 text-green-700 border-green-200',
  update: 'bg-blue-50 text-blue-700 border-blue-200',
  delete: 'bg-red-50 text-red-700 border-red-200',
  approve: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  reject: 'bg-rose-50 text-rose-700 border-rose-200',
  complete: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  dispatch: 'bg-purple-50 text-purple-700 border-purple-200',
  invite: 'bg-pink-50 text-pink-700 border-pink-200',
};

export function ActivityFeed({ limit = 20 }: { limit?: number }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user?.tenantId) return;

    const socket: Socket = io(`${API_BASE}/inventory`, {
      transports: ['websocket', 'polling'],
      auth: { token: getAccessToken() },
    });

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('subscribe-inventory', { tenantId: user.tenantId });
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('audit.created', (ev: AuditEvent) => {
      setEvents((prev) => [ev, ...prev].slice(0, limit));
    });

    return () => { socket.disconnect(); };
  }, [user?.tenantId, limit]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" /> Live activity
          <span className={[
            'inline-block h-2 w-2 rounded-full',
            connected ? 'bg-green-500' : 'bg-gray-300',
          ].join(' ')} />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 max-h-72 overflow-auto">
        {events.length === 0 && (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {connected ? 'Waiting for activity…' : 'Connecting…'}
          </div>
        )}
        {events.map((e, idx) => (
          <div key={`${e.createdAt}-${idx}`} className="flex items-start justify-between gap-2 text-xs">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className={ACTION_BADGE[e.action] || ''}>{e.action}</Badge>
                <span className="font-medium truncate">{e.userName || e.userEmail || 'system'}</span>
              </div>
              <div className="text-muted-foreground truncate">
                {e.module}
                {e.entityId ? ` · ${String(e.entityId).slice(0, 8)}…` : ''}
              </div>
            </div>
            <div className="text-muted-foreground tabular-nums whitespace-nowrap">
              {formatDistanceToNowStrict(new Date(e.createdAt), { addSuffix: true })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
