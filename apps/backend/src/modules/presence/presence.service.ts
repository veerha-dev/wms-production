import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

type Presence = 'active' | 'idle' | 'break' | 'offline';
const ALLOWED: Presence[] = ['active', 'idle', 'break', 'offline'];

@Injectable()
export class PresenceService {
  constructor(private db: DatabaseService) {}

  /**
   * Called by the worker app every ~30s. Sets presence to 'active' and updates last_heartbeat_at.
   * If the worker is currently on break we leave the break status alone — the app must POST a
   * status change to leave break.
   */
  async heartbeat(userId: string) {
    await this.db.query(
      `UPDATE users
          SET presence_status = CASE WHEN presence_status = 'break' THEN 'break' ELSE 'active' END,
              last_heartbeat_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [userId],
    );
    return { ok: true, at: new Date().toISOString() };
  }

  async setStatus(userId: string, status: Presence) {
    if (!ALLOWED.includes(status)) {
      throw new BadRequestException(`Invalid presence status: ${status}`);
    }
    await this.db.query(
      `UPDATE users SET presence_status = $2, updated_at = NOW() WHERE id = $1`,
      [userId, status],
    );
    return { ok: true, status };
  }

  /**
   * Mark stale 'active' rows as 'idle' if no heartbeat for the threshold. Runs in the background.
   */
  async sweepIdle(thresholdMinutes = 5) {
    const res = await this.db.query<{ flipped: string }>(
      `WITH flipped AS (
         UPDATE users SET presence_status = 'idle', updated_at = NOW()
           WHERE presence_status = 'active'
             AND (last_heartbeat_at IS NULL OR last_heartbeat_at < NOW() - ($1::int * INTERVAL '1 minute'))
         RETURNING 1
       )
       SELECT COUNT(*)::text AS flipped FROM flipped`,
      [thresholdMinutes],
    );
    return { flipped: parseInt(res.rows[0]?.flipped ?? '0', 10) };
  }
}
