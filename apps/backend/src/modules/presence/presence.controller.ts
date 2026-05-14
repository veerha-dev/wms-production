import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PresenceService } from './presence.service';

@Controller('api/v1/presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly service: PresenceService) {}

  @Post('heartbeat')
  async heartbeat(@Req() req: any) {
    const data = await this.service.heartbeat(req.user.id);
    return { success: true, data };
  }

  @Post('status')
  async setStatus(@Req() req: any, @Body() body: { status: 'active' | 'idle' | 'break' | 'offline' }) {
    const data = await this.service.setStatus(req.user.id, body.status);
    return { success: true, data };
  }
}
