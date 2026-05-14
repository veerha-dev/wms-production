import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TenantMiddleware } from './modules/common/tenant.middleware';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { ZonesModule } from './modules/zones/zones.module';
import { AislesModule } from './modules/aisles/aisles.module';
import { RacksModule } from './modules/racks/racks.module';
import { BinsModule } from './modules/bins/bins.module';
import { SkusModule } from './modules/skus/skus.module';
import { BatchesModule } from './modules/batches/batches.module';
import { SerialsModule } from './modules/serials/serials.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { DamagedItemsModule } from './modules/damaged-items/damaged-items.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { SalesOrdersModule } from './modules/sales-orders/sales-orders.module';
import { GrnModule } from './modules/grn/grn.module';
import { QcModule } from './modules/qc/qc.module';
import { PickListsModule } from './modules/pick-lists/pick-lists.module';
import { ShipmentsModule } from './modules/shipments/shipments.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AdjustmentsModule } from './modules/adjustments/adjustments.module';
import { CycleCountsModule } from './modules/cycle-counts/cycle-counts.module';
import { StockTransfersModule } from './modules/stock-transfers/stock-transfers.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PutawayModule } from './modules/putaway/putaway.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { WebsocketModule } from './websocket/websocket.module';
import { SettingsModule } from './modules/settings/settings.module';
import { EmailModule } from './modules/email/email.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { AuditModule } from './modules/audit/audit.module';
import { PackConsolidationModule } from './modules/pack-consolidation/pack-consolidation.module';
import { PickWavesModule } from './modules/pick-waves/pick-waves.module';
import { PresenceModule } from './modules/presence/presence.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    EmailModule,
    AuthModule,
    WarehousesModule,
    ZonesModule,
    AislesModule,
    RacksModule,
    BinsModule,
    SkusModule,
    BatchesModule,
    SerialsModule,
    InventoryModule,
    DamagedItemsModule,
    DashboardModule,
    CustomersModule,
    SuppliersModule,
    PurchaseOrdersModule,
    SalesOrdersModule,
    GrnModule,
    QcModule,
    PickListsModule,
    ShipmentsModule,
    ReturnsModule,
    TasksModule,
    UsersModule,
    InvoicesModule,
    AlertsModule,
    AdjustmentsModule,
    CycleCountsModule,
    StockTransfersModule,
    ReportsModule,
    PutawayModule,
    SuperAdminModule,
    WebsocketModule,
    SettingsModule,
    OnboardingModule,
    AuditModule,
    PackConsolidationModule,
    PickWavesModule,
    PresenceModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
