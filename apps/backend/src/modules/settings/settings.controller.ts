import {
  Controller, Get, Patch, Post, Body, Param,
  UseGuards, Request, ForbiddenException, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';
import { getCurrentTenantId } from '../common/tenant.context';
import {
  UpdateGeneralDto, UpdateNotificationsDto, UpdateAppearanceDto,
  UpdateSecurityPrefsDto, UpdateTenantInfoDto,
} from './dto';

@Controller('api/v1/settings')
@UseGuards(JwtAuthGuard)
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

  // ─── Tenant ─────────────────────────────────────────────────────────────────

  @Get('tenant')
  async getTenantInfo(@Request() req: any) {
    const data = await this.service.getTenantInfo(getCurrentTenantId());
    return { success: true, data };
  }

  @Patch('tenant')
  async updateTenantInfo(@Request() req: any, @Body() dto: UpdateTenantInfoDto) {
    if (req.user.role !== 'admin') throw new ForbiddenException('Only admins can update organization settings');
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
  async updateSecurityPolicy(@Request() req: any, @Body() body: Record<string, any>) {
    if (req.user.role !== 'admin') throw new ForbiddenException('Only admins can update the security policy');
    const data = await this.service.updateSecurityPolicy(getCurrentTenantId(), body);
    return { success: true, data };
  }

  // ─── Integrations ────────────────────────────────────────────────────────────

  @Get('integrations')
  async getIntegrations(@Request() req: any) {
    const data = await this.service.getIntegrations(getCurrentTenantId());
    return { success: true, data };
  }

  @Patch('integrations/:key')
  async updateIntegration(
    @Request() req: any,
    @Param('key') key: string,
    @Body() body: { connected: boolean; connectionDetails?: string },
  ) {
    if (req.user.role !== 'admin') throw new ForbiddenException('Only admins can manage integrations');
    await this.service.updateIntegration(getCurrentTenantId(), key, body.connected, body.connectionDetails);
    return { success: true };
  }

  // ─── Test Notification ───────────────────────────────────────────────────────

  @Post('notifications/test')
  @HttpCode(HttpStatus.OK)
  async sendTestNotification(@Request() req: any) {
    await this.service.sendTestNotification(getCurrentTenantId());
    return { success: true, message: 'Test notification sent' };
  }

  // ─── Tenant Approval Rules ──────────────────────────────────────────────────

  @Get('approval-rules')
  async getApprovalRules() {
    const data = await this.service.getApprovalRules(getCurrentTenantId());
    return { success: true, data };
  }

  @Patch('approval-rules/:module')
  async updateApprovalRule(
    @Request() req: any,
    @Param('module') module: string,
    @Body() body: { thresholdAmount: number; isActive: boolean },
  ) {
    if (req.user.role !== 'admin') throw new ForbiddenException('Only admins can update approval rules');
    const data = await this.service.updateApprovalRule(
      getCurrentTenantId(),
      module,
      body.thresholdAmount,
      body.isActive,
    );
    return { success: true, data };
  }
}
