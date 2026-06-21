import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStockLevels } from './useStockLevels';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useWMS } from '@/shared/contexts/WMSContext';

export function useRealtimeInventory(params?: Record<string, any>) {
  const { isAuthenticated } = useAuth();
  const { tenant } = useWMS();
  const socketRef = useRef<Socket | null>(null);
  const stockLevelsQuery = useStockLevels(params);

  useEffect(() => {
    if (!isAuthenticated || !tenant?.id) return;

    // Connect to WebSocket
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    socketRef.current = io(`${API_BASE_URL}/inventory`, {
      withCredentials: true,
    });

    const socket = socketRef.current;

    // Subscribe to inventory updates
    socket.emit('subscribe-inventory', { tenantId: tenant.id });
    socket.emit('subscribe-stock-levels', { tenantId: tenant.id });

    // Listen for updates
    socket.on('inventory-update', (data) => {
      console.log('Inventory update received:', data);
      // Invalidate relevant queries
      stockLevelsQuery.refetch();
    });

    socket.on('stock-level-update', (data) => {
      console.log('Stock level update received:', data);
      stockLevelsQuery.refetch();
    });

    socket.on('movement-update', (data) => {
      console.log('Movement update received:', data);
      stockLevelsQuery.refetch();
    });

    socket.on('damaged-item-update', (data) => {
      console.log('Damaged item update received:', data);
      stockLevelsQuery.refetch();
    });

    socket.on('adjustment-update', (data) => {
      console.log('Adjustment update received:', data);
      stockLevelsQuery.refetch();
    });

    // Connection status
    socket.on('connected', (data) => {
      console.log('Connected to inventory WebSocket:', data.message);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from inventory WebSocket');
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated, tenant?.id, stockLevelsQuery]);

  return stockLevelsQuery;
}
