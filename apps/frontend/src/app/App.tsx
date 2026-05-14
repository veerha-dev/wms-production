import { Toaster } from "@/shared/components/ui/toaster";
import { Toaster as Sonner } from "@/shared/components/ui/sonner";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/shared/contexts/AuthContext";
import { ThemeProvider } from "@/shared/contexts/ThemeContext";
import { WMSProvider } from "@/shared/contexts/WMSContext";
import { ModuleProvider } from "@/shared/contexts/ModuleContext";
import { InventoryProvider } from "@/shared/contexts/InventoryContext";
import { ZoneProvider } from "@/shared/contexts/ZoneContext";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { ErrorBoundary } from "@/shared/components/common/ErrorBoundary";

// Auth
import LoginPage from "@/features/auth/pages/LoginPage";
import SignupPage from "@/features/auth/pages/SignupPage";
import ForcePasswordChangePage from "@/features/auth/pages/ForcePasswordChangePage";
import OnboardingWizardPage from "@/features/onboarding/pages/OnboardingWizardPage";
// Dashboard
import Index from "./Index";
// Warehouse
import WarehousesPage from "@/features/warehouse/pages/WarehousesPage";
import MappingPage from "@/features/warehouse/pages/MappingPage";
// Inventory
import InventoryPage from "@/features/inventory/pages/InventoryPage";
// Operations
import WorkflowsPage from "@/features/operations/pages/WorkflowsPage";
import OperationsPage from "@/features/operations/pages/OperationsPage";
import InvoicesPage from "@/features/invoices/pages/InvoicesPage";
// Outbound
import ReturnsPage from "@/features/outbound/pages/ReturnsPage";
import SalesOrdersPage from "@/features/outbound/pages/SalesOrdersPage";
import PickListsPage from "@/features/outbound/pages/PickListsPage";
import PackingPage from "@/features/outbound/pages/PackingPage";
import ShipmentsPage from "@/features/outbound/pages/ShipmentsPage";
import WavePlanningPage from "@/features/outbound/pages/WavePlanningPage";
import ConsolidationPage from "@/features/outbound/pages/ConsolidationPage";
// Inbound
import PurchaseOrdersPage from "@/features/inbound/pages/PurchaseOrdersPage";
import GRNPage from "@/features/inbound/pages/GRNPage";
import QCInspectionsPage from "@/features/inbound/pages/QCInspectionsPage";
import PutawayPage from "@/features/inbound/pages/PutawayPage";
import SuppliersPage from "@/features/suppliers/pages/SuppliersPage";
// Reports
import AnalyticsPage from "@/features/reports/pages/AnalyticsPage";
import ReportsPage from "@/features/reports/pages/ReportsPage";
import StockReportPage from "@/features/reports/pages/reports/StockReportPage";
import MovementReportPage from "@/features/reports/pages/reports/MovementReportPage";
import PurchaseRegisterPage from "@/features/reports/pages/reports/PurchaseRegisterPage";
import SalesRegisterPage from "@/features/reports/pages/reports/SalesRegisterPage";
import ExpiryReportPage from "@/features/reports/pages/reports/ExpiryReportPage";
import LowStockReportPage from "@/features/reports/pages/reports/LowStockReportPage";
import WarehouseUtilizationPage from "@/features/reports/pages/reports/WarehouseUtilizationPage";
import AuditTrailPage from "@/features/reports/pages/reports/AuditTrailPage";
import SystemAuditLogPage from "@/features/audit/pages/SystemAuditLogPage";
// Settings & Users
import UsersPage from "@/features/users/pages/UsersPage";
import SettingsPage from "@/features/settings/pages/SettingsPage";
import DataSeedingPage from "@/features/settings/pages/DataSeedingPage";
import ModuleManagementPage from "@/features/settings/pages/ModuleManagementPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      gcTime: 1000 * 60 * 10,
    },
  },
});

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <WMSProvider>
        <ModuleProvider>
          <InventoryProvider>
            <ZoneProvider>
              <ErrorBoundary>
                {children}
              </ErrorBoundary>
            </ZoneProvider>
          </InventoryProvider>
        </ModuleProvider>
      </WMSProvider>
    </ProtectedRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <AuthProvider>
          <ThemeProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/force-password-change" element={<ForcePasswordChangePage />} />
            <Route path="/onboarding" element={<ProtectedRoute><OnboardingWizardPage /></ProtectedRoute>} />
            <Route path="/auth" element={<Navigate to="/login" replace />} />
            
            <Route path="/" element={<ProtectedLayout><Index /></ProtectedLayout>} />
            <Route path="/warehouses" element={<ProtectedLayout><WarehousesPage /></ProtectedLayout>} />
            <Route path="/inventory" element={<ProtectedLayout><InventoryPage /></ProtectedLayout>} />
            <Route path="/mapping" element={<ProtectedLayout><MappingPage /></ProtectedLayout>} />
            <Route path="/workflows" element={<ProtectedLayout><WorkflowsPage /></ProtectedLayout>} />
            <Route path="/operations" element={<ProtectedLayout><OperationsPage /></ProtectedLayout>} />
            <Route path="/invoices" element={<ProtectedLayout><InvoicesPage /></ProtectedLayout>} />
            <Route path="/analytics" element={<ProtectedLayout><AnalyticsPage /></ProtectedLayout>} />
            <Route path="/users" element={<ProtectedLayout><UsersPage /></ProtectedLayout>} />
            <Route path="/settings" element={<ProtectedLayout><SettingsPage /></ProtectedLayout>} />
            <Route path="/seed-data" element={<ProtectedLayout><DataSeedingPage /></ProtectedLayout>} />
            
            <Route path="/inbound" element={<ProtectedLayout><PurchaseOrdersPage /></ProtectedLayout>} />
            <Route path="/inbound/suppliers" element={<ProtectedLayout><SuppliersPage /></ProtectedLayout>} />
            <Route path="/inbound/grn" element={<ProtectedLayout><GRNPage /></ProtectedLayout>} />
            <Route path="/inbound/qc" element={<ProtectedLayout><QCInspectionsPage /></ProtectedLayout>} />
            <Route path="/inbound/putaway" element={<ProtectedLayout><PutawayPage /></ProtectedLayout>} />

            <Route path="/outbound" element={<ProtectedLayout><SalesOrdersPage /></ProtectedLayout>} />
            <Route path="/outbound/picking" element={<ProtectedLayout><PickListsPage /></ProtectedLayout>} />
            <Route path="/outbound/packing" element={<ProtectedLayout><PackingPage /></ProtectedLayout>} />
            <Route path="/outbound/shipping" element={<ProtectedLayout><ShipmentsPage /></ProtectedLayout>} />
            <Route path="/outbound/waves" element={<ProtectedLayout><WavePlanningPage /></ProtectedLayout>} />
            <Route path="/outbound/consolidation" element={<ProtectedLayout><ConsolidationPage /></ProtectedLayout>} />
            <Route path="/returns" element={<ProtectedLayout><ReturnsPage /></ProtectedLayout>} />
            
            <Route path="/reports" element={<ProtectedLayout><ReportsPage /></ProtectedLayout>} />
            <Route path="/reports/stock" element={<ProtectedLayout><StockReportPage /></ProtectedLayout>} />
            <Route path="/reports/movements" element={<ProtectedLayout><MovementReportPage /></ProtectedLayout>} />
            <Route path="/reports/purchase-register" element={<ProtectedLayout><PurchaseRegisterPage /></ProtectedLayout>} />
            <Route path="/reports/sales-register" element={<ProtectedLayout><SalesRegisterPage /></ProtectedLayout>} />
            <Route path="/reports/expiry" element={<ProtectedLayout><ExpiryReportPage /></ProtectedLayout>} />
            <Route path="/reports/low-stock" element={<ProtectedLayout><LowStockReportPage /></ProtectedLayout>} />
            <Route path="/reports/warehouse-utilization" element={<ProtectedLayout><WarehouseUtilizationPage /></ProtectedLayout>} />
            <Route path="/reports/audit-trail" element={<ProtectedLayout><AuditTrailPage /></ProtectedLayout>} />
            <Route path="/reports/system-audit" element={<ProtectedLayout><SystemAuditLogPage /></ProtectedLayout>} />
            
            <Route path="/admin/modules" element={<ProtectedLayout><ModuleManagementPage /></ProtectedLayout>} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
