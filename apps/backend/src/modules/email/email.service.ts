import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import {
  welcomeEmail,
  inviteEmail,
  passwordResetEmail,
  approvalRequestEmail,
  notificationEmail,
  notificationDigestEmail,
  dailySummaryEmail,
} from './templates';

export interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private from: string = '';
  private appUrl: string = '';

  /**
   * Result of the startup `transporter.verify()`. Null = not checked yet (or
   * NO-OP mode). Kept so an operator can see, in one place, whether the SMTP
   * credentials this process booted with were ever good.
   */
  private smtpVerified: boolean | null = null;
  private smtpVerifyError: string | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = (this.config.get<string>('SMTP_HOST') || '').trim();
    this.from = this.config.get<string>('SMTP_FROM') || 'Veerha WMS <noreply@veerha.com>';
    this.appUrl = this.config.get<string>('APP_URL') || 'http://localhost:8080';

    if (!host) {
      this.logger.warn(
        'SMTP_HOST not configured — EmailService running in NO-OP mode. Every email (welcome, invite, password reset, notification alerts, digests, daily summary) is LOGGED AND DROPPED, and notification_email_queue rows will still be marked sent. Set SMTP_HOST/PORT/USER/PASS to deliver mail.',
      );
      return;
    }

    const port = this.parsePort(this.config.get<string>('SMTP_PORT'));
    const secure = this.parseSecure(this.config.get<string>('SMTP_SECURE'), port);
    const user = (this.config.get<string>('SMTP_USER') || '').trim();
    const pass = this.config.get<string>('SMTP_PASS') || '';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      // Only send AUTH when a username is actually configured. A local mail
      // catcher (Mailpit/MailHog) accepts no credentials at all, and handing
      // nodemailer an empty auth block makes it attempt PLAIN with an undefined
      // user — which those servers reject.
      ...(user ? { auth: { user, pass } } : {}),
    });

    this.logger.log(
      `EmailService initialised — ${host}:${port} secure=${secure} auth=${user ? user : 'none'} from="${this.from}"`,
    );

    // Fire-and-forget: a mail server that is down must never stop the API from
    // booting. It must, however, be LOUD in the logs — a silently wrong password
    // is the failure mode this whole check exists to kill.
    void this.verifyTransport(host, port, secure, user);
  }

  /**
   * Port parsing that fails loudly rather than silently becoming NaN.
   * `parseInt(undefined)` → NaN → nodemailer picks its own default, which is how
   * a typo'd SMTP_PORT turns into a connection to the wrong port with no clue.
   */
  private parsePort(raw: string | undefined): number {
    const trimmed = (raw || '').trim();
    if (!trimmed) return 587;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n <= 0 || n > 65535) {
      this.logger.error(`SMTP_PORT="${raw}" is not a valid port — falling back to 587`);
      return 587;
    }
    return n;
  }

  /**
   * `secure: true` means implicit TLS from the first byte (port 465);
   * `false` means plaintext connect then STARTTLS (587/2587/2525/1025).
   *
   * When SMTP_SECURE is unset we derive it from the port, so a provider like
   * Resend configured on 465 without SMTP_SECURE does not fail with a cryptic
   * timeout / "wrong version number" TLS error.
   */
  private parseSecure(raw: string | undefined, port: number): boolean {
    const v = (raw || '').trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(v)) return true;
    if (['false', '0', 'no', 'off'].includes(v)) return false;
    if (v) this.logger.warn(`SMTP_SECURE="${raw}" not understood — deriving from port ${port}`);
    return port === 465;
  }

  /**
   * Proves at boot that the configured host/port/credentials actually work.
   * Never throws: mail being down is not a reason for the warehouse app to be
   * down, but it IS a reason for an unmissable error line.
   */
  private async verifyTransport(host: string, port: number, secure: boolean, user: string): Promise<void> {
    if (!this.transporter) return;
    try {
      await this.transporter.verify();
      this.smtpVerified = true;
      this.smtpVerifyError = null;
      this.logger.log(`SMTP ready: ${host}:${port} (secure=${secure}) as ${user || 'anonymous'}`);
    } catch (err) {
      this.smtpVerified = false;
      this.smtpVerifyError = (err as Error).message;
      this.logger.error(
        `SMTP VERIFY FAILED for ${host}:${port} (secure=${secure}) as ${user || 'anonymous'} — ${this.smtpVerifyError}. ` +
          'Outgoing email will fail until this is fixed. Check SMTP_HOST/SMTP_PORT/SMTP_SECURE/SMTP_USER/SMTP_PASS.',
      );
    }
  }

  /** True when a transporter exists (i.e. SMTP_HOST is set). */
  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Startup verification result, for /health-style surfacing. */
  getSmtpStatus(): { configured: boolean; verified: boolean | null; error: string | null } {
    return {
      configured: this.isConfigured(),
      verified: this.smtpVerified,
      error: this.smtpVerifyError,
    };
  }

  async send(params: SendMailParams): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `[NO-OP EMAIL — SMTP_HOST unset, nothing was delivered] to=${params.to} subject="${params.subject}"`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      });
      this.logger.log(`Email sent to ${params.to} — "${params.subject}"`);
    } catch (err) {
      const e = err as Error & { code?: string; responseCode?: number; response?: string };
      // Rethrown unchanged (not wrapped) so the notification queue worker's
      // `(err as Error).message` lands a useful string in
      // notification_email_queue.last_error — e.g. "Invalid login: 535 ...".
      this.logger.error(
        `Failed to send email to ${params.to} — "${params.subject}": ${e.message}` +
          `${e.code ? ` [code=${e.code}]` : ''}${e.responseCode ? ` [smtp=${e.responseCode}]` : ''}`,
      );
      throw err;
    }
  }

  // ─── High-level helpers ─────────────────────────────────────────────

  async sendWelcomeEmail(params: {
    to: string;
    fullName: string;
    tempPassword?: string;
    tenantName?: string;
  }) {
    const loginUrl = `${this.appUrl}/login`;
    const html = welcomeEmail({
      fullName: params.fullName,
      email: params.to,
      tempPassword: params.tempPassword,
      tenantName: params.tenantName,
      loginUrl,
    });
    await this.send({
      to: params.to,
      subject: 'Welcome to Veerha WMS — get started',
      html,
    });
  }

  async sendInviteEmail(params: {
    to: string;
    fullName: string;
    tempPassword: string;
    role: string;
    warehouseName?: string;
    invitedByName?: string;
  }) {
    const loginUrl = `${this.appUrl}/login`;
    const html = inviteEmail({
      fullName: params.fullName,
      email: params.to,
      tempPassword: params.tempPassword,
      role: params.role,
      warehouseName: params.warehouseName,
      invitedByName: params.invitedByName,
      loginUrl,
    });
    await this.send({
      to: params.to,
      subject: `You've been invited to Veerha WMS as ${params.role}`,
      html,
    });
  }

  async sendPasswordResetEmail(params: { to: string; fullName: string; tempPassword: string }) {
    const loginUrl = `${this.appUrl}/login`;
    const html = passwordResetEmail({
      fullName: params.fullName,
      tempPassword: params.tempPassword,
      loginUrl,
    });
    await this.send({
      to: params.to,
      subject: 'Your Veerha WMS password has been reset',
      html,
    });
  }

  async sendApprovalRequestEmail(params: {
    to: string;
    fullName: string;
    requestType: string;
    requestedBy: string;
    detail: string;
    linkPath: string;
  }) {
    const link = `${this.appUrl}${params.linkPath}`;
    const html = approvalRequestEmail({
      fullName: params.fullName,
      requestType: params.requestType,
      requestedBy: params.requestedBy,
      detail: params.detail,
      link,
    });
    await this.send({
      to: params.to,
      subject: `Approval required: ${params.requestType}`,
      html,
    });
  }

  // ─── Notification engine ────────────────────────────────────────────────
  // The notification email queue owns subject construction (`[Veerha] {title}`,
  // spec Part 5); these helpers only render and send.

  /** Exposed so the queue worker can build `${APP_URL}${link_path}` links. */
  getAppUrl(): string {
    return this.appUrl || 'http://localhost:8080';
  }

  async sendNotificationEmail(params: {
    to: string;
    subject: string;
    recipientName?: string;
    title: string;
    body?: string;
    severity?: string;
    category?: string;
    entityType?: string;
    entityId?: string;
    warehouseName?: string;
    linkPath?: string;
  }) {
    const html = notificationEmail({
      recipientName: params.recipientName,
      title: params.title,
      body: params.body,
      severity: params.severity,
      category: params.category,
      entityType: params.entityType,
      entityId: params.entityId,
      warehouseName: params.warehouseName,
      link: `${this.getAppUrl()}${params.linkPath || '/'}`,
    });
    await this.send({ to: params.to, subject: params.subject, html });
  }

  async sendNotificationDigestEmail(params: {
    to: string;
    recipientName?: string;
    periodLabel?: string;
    items: Array<{ title: string; body?: string; linkPath?: string; severity?: string }>;
  }) {
    const appUrl = this.getAppUrl();
    const periodLabel = params.periodLabel || 'last hour';
    const html = notificationDigestEmail({
      recipientName: params.recipientName,
      periodLabel,
      items: params.items.map((i) => ({
        title: i.title,
        body: i.body,
        severity: i.severity,
        link: `${appUrl}${i.linkPath || '/'}`,
      })),
      appUrl,
    });
    await this.send({
      to: params.to,
      subject: `[Veerha] ${params.items.length} alert${params.items.length === 1 ? '' : 's'} in the ${periodLabel}`,
      html,
    });
  }

  async sendDailySummaryEmail(params: {
    to: string;
    recipientName?: string;
    tenantName?: string;
    date: string;
    ordersShipped: number;
    grnsReceived: number;
    pendingApprovals: number;
    lowStockCount: number;
    topAlerts?: Array<{ title: string; severity?: string }>;
  }) {
    const html = dailySummaryEmail({ ...params, appUrl: this.getAppUrl() });
    await this.send({
      to: params.to,
      subject: `[Veerha] Daily summary — ${params.date}`,
      html,
    });
  }
}
