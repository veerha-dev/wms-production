export * from './hooks/useSKUs';
export * from './hooks/useStockLevels';
export * from './hooks/useBatches';
export * from './hooks/useMovements';
export * from './hooks/useProcessStockMovement';
export * from './hooks/useRealtimeInventory';
export * from './hooks/useSuppliers';
// Customers now live in features/customers — re-exported here for backwards compatibility.
export * from '@/features/customers/hooks/useCustomers';
export { default as InventoryPage } from './pages/InventoryPage';
