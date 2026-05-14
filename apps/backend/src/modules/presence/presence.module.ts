import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';

@Module({
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule implements OnModuleInit {
  private readonly logger = new Logger(PresenceModule.name);

  constructor(private readonly presence: PresenceService) {}

  onModuleInit() {
    // Background sweep: every 60s, flip stale 'active' users to 'idle' if no heartbeat for >5min.
    const intervalMs = 60_000;
    setInterval(() => {
      this.presence.sweepIdle().catch((err) => this.logger.error('Idle sweep failed', err as Error));
    }, intervalMs);
    this.logger.log(`Presence idle sweep started (${intervalMs / 1000}s interval)`);
  }
}
