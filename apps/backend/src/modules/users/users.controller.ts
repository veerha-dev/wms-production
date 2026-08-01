import { Controller, Get, Post, Put, Delete, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto';

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

  @Put('permissions')
  async updatePermissions(@Body() body: { permissions: any[] }) {
    const data = await this.service.updatePermissions(body.permissions);
    return { success: true, data };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.service.findById(id);
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @Request() req: any) {
    const data = await this.service.create(dto, req.user?.id);
    return { success: true, data };
  }

  @Post('invite')
  @UseGuards(JwtAuthGuard)
  async invite(@Body() dto: CreateUserDto, @Request() req: any) {
    const invitedByName = req.user?.fullName || req.user?.email;
    const data = await this.service.invite({ ...dto, invitedByName, invitedById: req.user?.id });
    return { success: true, data };
  }

  @Post('invite/bulk')
  @UseGuards(JwtAuthGuard)
  async inviteBulk(@Body() body: { invites: CreateUserDto[] }, @Request() req: any) {
    const invitedByName = req.user?.fullName || req.user?.email;
    const data = await this.service.inviteBulk(body.invites || [], invitedByName, req.user?.id);
    return { success: true, data };
  }

  @Post(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    const data = await this.service.deactivate(id);
    return { success: true, data };
  }

  @Post(':id/reactivate')
  async reactivate(@Param('id') id: string) {
    const data = await this.service.reactivate(id);
    return { success: true, data };
  }

  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string) {
    const data = await this.service.resetPassword(id);
    return { success: true, data };
  }

  @Post(':id/force-logout')
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
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { success: true, data: { deleted: true } };
  }
}
