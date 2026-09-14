import { lazy, Suspense } from "react";
import { Toaster } from "@/shared/components/ui/toaster";
import { Toaster as Sonner } from "@/shared/components/ui/sonner";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/shared/contexts/AuthContext";
import { ThemeProvider } from "@/shared/contexts/ThemeContext";
import { WMSProvider } from "@/shared/contexts/WMSContext";
import { ModuleProvider } from "@/shared/contexts/ModuleContext";
import { InventoryProvider } from "@/shared/contexts/InventoryContext";
import { ZoneProvider } from "@/shared/contexts/ZoneContext";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { ErrorBoundary } from "@/shared/components/common/ErrorBoundary";
import { PwaShell } from "@/shared/components/pwa";

/**
 * ─── EAGER ROUTES ───────────────────────────────────────────────────────────
 * These stay in the main bundle on purpose, because they are the screens that
 * must render on the first paint over bad warehouse wifi:
 *
 *  - the auth pages: every session starts on one of them, so lazy-loading them
 *    would just add a round-trip in front of the login form;
 *  - the /m worker screens: a picker on a phone opens the installed PWA
 *    straight into /m (it is a manifest shortcut) and must not wait on a chunk.
 *
 * All of them are small — cards, inputs and lucide icons, no charts, no PDF or
 * xlsx tooling — so keeping them eager costs very little.
 */
import LoginPage from "@/features/auth/pages/LoginPage";
import SignupPage from "@/features/auth/pages/SignupPage";
import ForcePasswordChangePage from "@/features/auth/pages/ForcePasswordChangePage";
import MobileHomePage from "@/features/mobile/pages/MobileHomePage";
import MobilePutawayPage from "@/features/mobile/pages/MobilePutawayPage";
import MobilePickPage from "@/features/mobile/pages/MobilePickPage";
import MobilePackPage from "@/features/mobile/pages/MobilePackPage";

/**
 * ─── LAZY ROUTES ────────────────────────────────────────────────────────────
 * Everything below is a desktop back-office screen. Statically importing them
 * pulled recharts, jspdf, xlsx and html2canvas into the bundle every worker
 * downloads at install time, for screens their role cannot even open.
 *
 * Each of these becomes its own chunk under assets/lazy/, which vite.config.ts
 * keeps OUT of the PWA precache and caches on first use instead.
 */
// Onboarding — a one-time, admin-only wizard
const OnboardingWizardPage = lazy(() => import("@/features/onboarding/pages/OnboardingWizardPage"));
// Dashboard
const Index = lazy(() => import("./Index"));
// Warehouse
const WarehousesPage = lazy(() => import("@/features/warehouse/pages/WarehousesPage"));
const MappingPage = lazy(() => import("@/features/warehouse/pages/MappingPage"));
// Inventory
const InventoryPage = lazy(() => import("@/features/inventory/pages/InventoryPage"));
// Operations
const WorkflowsPage = lazy(() => import("@/features/operations/pages/WorkflowsPage"));
const OperationsPage = lazy(() => import("@/features/operations/pages/OperationsPage"));
const InvoicesPage = lazy(() => import("@/features/invoices/pages/InvoicesPage"));
// Outbound
const CustomersPage = lazy(() => import("@/features/customers/pages/CustomersPage"));
const CustomerDetailPage = lazy(() => import("@/features/customers/pages/CustomerDetailPage"));
const ReturnsPage = lazy(() => import("@/features/outbound/pages/ReturnsPage"));
const SalesOrdersPage = lazy(() => import("@/features/outbound/pages/SalesOrdersPage"));
const PickListsPage = lazy(() => import("@/features/outbound/pages/PickListsPage"));
const PackingPage = lazy(() => import("@/features/outbound/pages/PackingPage"));
const ShipmentsPage = lazy(() => import("@/features/outbound/pages/ShipmentsPage"));
const WavePlanningPage = lazy(() => import("@/features/outbound/pages/WavePlanningPage"));
const ConsolidationPage = lazy(() => import("@/features/outbound/pages/ConsolidationPage"));
// Inbound
const PurchaseOrdersPage = lazy(() => import("@/features/inbound/pages/PurchaseOrdersPage"));
const GRNPage = lazy(() => import("@/features/inbound/pages/GRNPage"));
const QCInspectionsPage = lazy(() => import("@/features/inbound/pages/QCInspectionsPage"));
const PutawayPage = lazy(() => import("@/features/inbound/pages/PutawayPage"));
const SuppliersPage = lazy(() => import("@/features/suppliers/pages/SuppliersPage"));
// Reports — every one of these renders recharts, and several export PDF/xlsx
const AnalyticsPage = lazy(() => import("@/features/reports/pages/AnalyticsPage"));
const ReportsPage = lazy(() => import("@/features/reports/pages/ReportsPage"));
const StockReportPage = lazy(() => import("@/features/reports/pages/reports/StockReportPage"));
const MovementReportPage = lazy(() => import("@/features/reports/pages/reports/MovementReportPage"));
const PurchaseRegisterPage = lazy(() => import("@/features/reports/pages/reports/PurchaseRegisterPage"));
const SalesRegisterPage = lazy(() => import("@/features/reports/pages/reports/SalesRegisterPage"));
const ExpiryReportPage = lazy(() => import("@/features/reports/pages/reports/ExpiryReportPage"));
const LowStockReportPage = lazy(() => import("@/features/reports/pages/reports/LowStockReportPage"));
const WarehouseUtilizationPage = lazy(() => import("@/features/reports/pages/reports/WarehouseUtilizationPage"));
const AuditTrailPage = lazy(() => import("@/features/reports/pages/reports/AuditTrailPage"));
const SystemAuditLogPage = lazy(() => import("@/features/audit/pages/SystemAuditLogPage"));
// Settings & Users
const UsersPage = lazy(() => import("@/features/users/pages/UsersPage"));
const SettingsPage = lazy(() => import("@/features/settings/pages/SettingsPage"));
const DataSeedingPage = lazy(() => import("@/features/settings/pages/DataSeedingPage"));
const ModuleManagementPage = lazy(() => import("@/features/settings/pages/ModuleManagementPage"));
// Notifications
const NotificationCenterPage = lazy(() => import("@/features/notifications/pages/NotificationCenterPage"));

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

/**
 * Shown while a lazy route chunk is in flight. Deliberately identical to the
 * auth-check spinner in <ProtectedRoute /> — navigating between two screens
 * already shows this exact treatment while the session resolves, so a chunk
 * fetch reads as the same "working on it" state rather than a blank flash.
 */
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

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
          {/* Offline banner, update prompt and iOS install hint — fixed overlays only,
              rendered for every route including the chrome-less /m worker screens. */}
          <PwaShell />
          {/* One Suspense around the whole route table — the eager routes never
              suspend, so this only ever renders for a lazy chunk fetch. */}
          <Suspense fallback={<RouteFallback />}>
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
            {/* Every authenticated role can see their own notifications — no module gate */}
            <Route path="/notifications" element={<ProtectedLayout><NotificationCenterPage /></ProtectedLayout>} />
            <Route path="/seed-data" element={<ProtectedLayout><DataSeedingPage /></ProtectedLayout>} />
            
            <Route path="/inbound" element={<ProtectedLayout><PurchaseOrdersPage /></ProtectedLayout>} />
            <Route path="/inbound/suppliers" element={<ProtectedLayout><SuppliersPage /></ProtectedLayout>} />
            <Route path="/inbound/grn" element={<ProtectedLayout><GRNPage /></ProtectedLayout>} />
            <Route path="/inbound/qc" element={<ProtectedLayout><QCInspectionsPage /></ProtectedLayout>} />
            <Route path="/inbound/putaway" element={<ProtectedLayout><PutawayPage /></ProtectedLayout>} />

            <Route path="/outbound" element={<ProtectedLayout><SalesOrdersPage /></ProtectedLayout>} />
            <Route path="/outbound/customers" element={<ProtectedLayout><CustomersPage /></ProtectedLayout>} />
            <Route path="/outbound/customers/:id" element={<ProtectedLayout><CustomerDetailPage /></ProtectedLayout>} />
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

            {/* Mobile worker routes — touch-optimised, no AppLayout chrome */}
            <Route path="/m" element={<ProtectedRoute><MobileHomePage /></ProtectedRoute>} />
            <Route path="/m/putaway" element={<ProtectedRoute><MobilePutawayPage /></ProtectedRoute>} />
            <Route path="/m/pick" element={<ProtectedRoute><MobilePickPage /></ProtectedRoute>} />
            <Route path="/m/pack" element={<ProtectedRoute><MobilePackPage /></ProtectedRoute>} />
            
            <Route path="/admin/modules" element={<ProtectedLayout><ModuleManagementPage /></ProtectedLayout>} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
