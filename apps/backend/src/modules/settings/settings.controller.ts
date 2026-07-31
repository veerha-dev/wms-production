import {
  Controller, Get, Patch, Post, Body, Param,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SettingsService } from './settings.service';
import { getCurrentTenantId } from '../common/tenant.context';
import {
  UpdateGeneralDto, UpdateNotificationsDto, UpdateAppearanceDto,
  UpdateSecurityPrefsDto, UpdateTenantInfoDto, UpdateApprovalRuleDto,
  UpdateIntegrationDto, UpdateSecurityPolicyDto, UpdateNotificationConfigDto,
} from './dto';

@Controller('api/v1/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  // ─── Preferences ────────────────────────────────────────────────────────────

  @Get('preferences')
  async getPreferences(@Request() req: any) {
    const prefs = await this.service.getPreferences(req.user.id, req.user.tenantId || getCurrentTenantId());
    return { success: true, data: prefs };
  }

  @Patch('preferences/general')
  async updateGeneral(@Request() req: any, @Body() dto: UpdateGeneralDto) {
    const prefs = await this.service.updatePreferences(req.user.id, req.user.tenantId || getCurrentTenantId(), dto);
    return { success: true, data: prefs };
  }

  @Patch('preferences/notifications')
  async updateNotifications(@Request() req: any, @Body() dto: UpdateNotificationsDto) {
    const prefs = await this.service.updatePreferences(req.user.id, req.user.tenantId || getCurrentTenantId(), dto);
    return { success: true, data: prefs };
  }

  @Patch('preferences/appearance')
  async updateAppearance(@Request() req: any, @Body() dto: UpdateAppearanceDto) {
    const prefs = await this.service.updatePreferences(req.user.id, req.user.tenantId || getCurrentTenantId(), dto);
    return { success: true, data: prefs };
  }

  @Patch('preferences/security')
  async updateSecurityPrefs(@Request() req: any, @Body() dto: UpdateSecurityPrefsDto) {
    const prefs = await this.service.updatePreferences(req.user.id, req.user.tenantId || getCurrentTenantId(), dto);
    return { success: true, data: prefs };
  }

  // ─── Tenant / Organization ──────────────────────────────────────────────────

  @Get('tenant')
  async getTenantInfo() {
    const data = await this.service.getTenantInfo(getCurrentTenantId());
    return { success: true, data };
  }

  @Patch('tenant')
  @Roles('admin')
  async updateTenantInfo(@Body() dto: UpdateTenantInfoDto) {
    const data = await this.service.updateTenantInfo(getCurrentTenantId(), dto);
    return { success: true, data };
  }

  // ─── Tenant Security Policy ─────────────────────────────────────────────────

  @Get('security-policy')
  async getSecurityPolicy() {
    const data = await this.service.getSecurityPolicy(getCurrentTenantId());
    return { success: true, data };
  }

  @Patch('security-policy')
  @Roles('admin')
  async updateSecurityPolicy(@Body() dto: UpdateSecurityPolicyDto) {
    const data = await this.service.updateSecurityPolicy(getCurrentTenantId(), dto);
    return { success: true, data };
  }

  // ─── Integrations ────────────────────────────────────────────────────────────

  @Get('integrations')
  async getIntegrations() {
    const data = await this.service.getIntegrations(getCurrentTenantId());
    return { success: true, data };
  }

  @Patch('integrations/:key')
  @Roles('admin')
  async updateIntegration(@Param('key') key: string, @Body() dto: UpdateIntegrationDto) {
    await this.service.updateIntegration(
      getCurrentTenantId(),
      key,
      dto.connected,
      dto.connectionDetails,
    );
    const data = await this.service.getIntegrations(getCurrentTenantId());
    return { success: true, data };
  }

  // ─── Test Notification ───────────────────────────────────────────────────────

  @Post('notifications/test')
  @HttpCode(HttpStatus.OK)
  async sendTestNotification() {
    await this.service.sendTestNotification(getCurrentTenantId());
    return { success: true, message: 'Test notification sent' };
  }

  // ─── Tenant Notification Config (per alert type) ────────────────────────────

  @Get('notifications-config')
  async getNotificationsConfig() {
    const data = await this.service.getNotificationSettings(getCurrentTenantId());
    return { success: true, data, meta: { total: data.length } };
  }

  @Patch('notifications-config/:alertType')
  @Roles('admin')
  async updateNotificationsConfig(
    @Param('alertType') alertType: string,
    @Body() dto: UpdateNotificationConfigDto,
  ) {
    const data = await this.service.updateNotificationSetting(
      getCurrentTenantId(),
      alertType,
      dto,
    );
    return { success: true, data };
  }

  // ─── Tenant Approval Rules ──────────────────────────────────────────────────

  @Get('approval-rules')
  async getApprovalRules() {
    const data = await this.service.getApprovalRules(getCurrentTenantId());
    return { success: true, data };
  }

  @Patch('approval-rules/:module')
  @Roles('admin')
  async updateApprovalRule(
    @Param('module') module: string,
    @Body() dto: UpdateApprovalRuleDto,
  ) {
    const data = await this.service.updateApprovalRule(getCurrentTenantId(), module, dto);
    return { success: true, data };
  }
}
