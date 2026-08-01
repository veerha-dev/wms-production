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

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const host = this.config.get<string>('SMTP_HOST');
    this.from = this.config.get<string>('SMTP_FROM') || 'Veerha WMS <noreply@veerha.com>';
    this.appUrl = this.config.get<string>('APP_URL') || 'http://localhost:8080';

    if (!host) {
      this.logger.warn('SMTP_HOST not configured — EmailService running in NO-OP mode (emails will be logged only)');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: parseInt(this.config.get<string>('SMTP_PORT') || '587', 10),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });

    this.logger.log(`EmailService initialised — sending via ${host}`);
  }

  async send(params: SendMailParams): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[NO-OP EMAIL] to=${params.to} subject="${params.subject}"`);
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
      this.logger.error(`Failed to send email to ${params.to}`, err as Error);
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
