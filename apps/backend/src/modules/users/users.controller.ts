import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CreateUserDto, UpdateUserDto, QueryUserDto, UpdatePermissionsDto } from './dto';

/**
 * Permissions Matrix coverage (module "Users"), enforced by PermissionsGuard.
 *
 * Deliberately NOT guarded:
 *   - GET / and GET /:id — the Operations task-assignment panel loads the user
 *     list for any role, so a Users/view toggle would break a worker flow.
 *   - PUT /:id — this is also the self-service profile update (Settings →
 *     Profile calls PUT /users/{ownId}); a Users/edit toggle would stop users
 *     editing their own name and phone.
 */
@Controller('api/v1/users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Get()
  async findAll(@Query() query: QueryUserDto) {
    const result = await this.service.findAll(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get('stats')
  async getStats() {
    const data = await this.service.getStats();
    return { success: true, data };
  }

  @Get('permissions')
  async getPermissions() {
    const data = await this.service.getPermissions();
    return { success: true, data };
  }

  /**
   * Writing the matrix itself is gated on Users/manage — seeded false for
   * manager and worker, so in practice only an admin (who bypasses) can
   * reconfigure permissions.
   */
  @Put('permissions')
  @RequirePermission('Users', 'manage')
  async updatePermissions(@Body() dto: UpdatePermissionsDto) {
    const data = await this.service.updatePermissions(dto.permissions);
    return { success: true, data };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.service.findById(id);
    return { success: true, data };
  }

  @Post()
  @RequirePermission('Users', 'create')
  async create(@Body() dto: CreateUserDto, @Request() req: any) {
    const data = await this.service.create(dto, req.user?.id);
    return { success: true, data };
  }

  @Post('invite')
  @RequirePermission('Users', 'create')
  @UseGuards(JwtAuthGuard)
  async invite(@Body() dto: CreateUserDto, @Request() req: any) {
    const invitedByName = req.user?.fullName || req.user?.email;
    const data = await this.service.invite({ ...dto, invitedByName, invitedById: req.user?.id });
    return { success: true, data };
  }

  @Post('invite/bulk')
  @RequirePermission('Users', 'create')
  @UseGuards(JwtAuthGuard)
  async inviteBulk(@Body() body: { invites: CreateUserDto[] }, @Request() req: any) {
    const invitedByName = req.user?.fullName || req.user?.email;
    const data = await this.service.inviteBulk(body.invites || [], invitedByName, req.user?.id);
    return { success: true, data };
  }

  @Post(':id/deactivate')
  @RequirePermission('Users', 'edit')
  async deactivate(@Param('id') id: string) {
    const data = await this.service.deactivate(id);
    return { success: true, data };
  }

  @Post(':id/reactivate')
  @RequirePermission('Users', 'edit')
  async reactivate(@Param('id') id: string) {
    const data = await this.service.reactivate(id);
    return { success: true, data };
  }

  @Post(':id/reset-password')
  @RequirePermission('Users', 'manage')
  async resetPassword(@Param('id') id: string) {
    const data = await this.service.resetPassword(id);
    return { success: true, data };
  }

  @Post(':id/force-logout')
  @RequirePermission('Users', 'manage')
  @UseGuards(JwtAuthGuard)
  async forceLogout(@Param('id') id: string) {
    const data = await this.service.forceLogout(id);
    return { success: true, data };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const data = await this.service.update(id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermission('Users', 'delete')
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { success: true, data: { deleted: true } };
  }
}
