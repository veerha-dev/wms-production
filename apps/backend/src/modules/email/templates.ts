// Plain-HTML email templates. Kept dependency-free so they compile with the rest of the backend.
// Designed for transactional clarity, not visual fanciness.

const baseStyles = `
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: #f7f7f9;
  padding: 32px 16px;
  color: #1a1a1a;
  line-height: 1.5;
`;
const cardStyles = `
  max-width: 560px;
  margin: 0 auto;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 32px;
`;
const codeBlock = `
  display: inline-block;
  background: #f1f5f9;
  padding: 8px 14px;
  border-radius: 6px;
  font-family: SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 15px;
  letter-spacing: 0.5px;
`;
const btn = `
  display: inline-block;
  background: #0f172a;
  color: #ffffff !important;
  text-decoration: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-weight: 600;
  margin-top: 8px;
`;

function wrap(inner: string) {
  return `<div style="${baseStyles}"><div style="${cardStyles}">${inner}<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/><p style="font-size:12px;color:#64748b;">Veerha WMS · Automated message · Please do not reply.</p></div></div>`;
}

export function welcomeEmail(p: {
  fullName: string;
  email: string;
  tempPassword?: string;
  tenantName?: string;
  loginUrl: string;
}) {
  const pwBlock = p.tempPassword
    ? `<p>Temporary password: <span style="${codeBlock}">${p.tempPassword}</span></p>
       <p>You'll be asked to choose a new password on first login.</p>`
    : '';
  return wrap(`
    <h2 style="margin:0 0 16px 0;">Welcome to Veerha WMS${p.tenantName ? `, ${p.tenantName}` : ''}!</h2>
    <p>Hi ${escape(p.fullName)},</p>
    <p>Your Veerha WMS account is ready. Sign in to start setting up your warehouse.</p>
    <p>Login email: <span style="${codeBlock}">${escape(p.email)}</span></p>
    ${pwBlock}
    <p><a href="${p.loginUrl}" style="${btn}">Sign in to Veerha</a></p>
  `);
}

export function inviteEmail(p: {
  fullName: string;
  email: string;
  tempPassword: string;
  role: string;
  warehouseName?: string;
  invitedByName?: string;
  loginUrl: string;
}) {
  return wrap(`
    <h2 style="margin:0 0 16px 0;">You've been invited to Veerha WMS</h2>
    <p>Hi ${escape(p.fullName)},</p>
    <p>${p.invitedByName ? `${escape(p.invitedByName)} has invited you` : "You've been invited"} to join as <strong>${escape(p.role)}</strong>${p.warehouseName ? ` for the warehouse <strong>${escape(p.warehouseName)}</strong>` : ''}.</p>
    <p>Login email: <span style="${codeBlock}">${escape(p.email)}</span></p>
    <p>Temporary password: <span style="${codeBlock}">${p.tempPassword}</span></p>
    <p>You'll be asked to set your own password on first login.</p>
    <p><a href="${p.loginUrl}" style="${btn}">Accept invitation</a></p>
  `);
}

export function passwordResetEmail(p: { fullName: string; tempPassword: string; loginUrl: string }) {
  return wrap(`
    <h2 style="margin:0 0 16px 0;">Your password has been reset</h2>
    <p>Hi ${escape(p.fullName)},</p>
    <p>An administrator has reset your Veerha WMS password.</p>
    <p>Temporary password: <span style="${codeBlock}">${p.tempPassword}</span></p>
    <p>You'll be asked to choose a new password on next login.</p>
    <p><a href="${p.loginUrl}" style="${btn}">Sign in</a></p>
    <p style="font-size:13px;color:#64748b;">If you did not expect this, contact your administrator immediately.</p>
  `);
}

export function approvalRequestEmail(p: {
  fullName: string;
  requestType: string;
  requestedBy: string;
  detail: string;
  link: string;
}) {
  return wrap(`
    <h2 style="margin:0 0 16px 0;">Approval required</h2>
    <p>Hi ${escape(p.fullName)},</p>
    <p>${escape(p.requestedBy)} has submitted a <strong>${escape(p.requestType)}</strong> that requires your approval.</p>
    <p style="background:#f8fafc;padding:12px 16px;border-radius:8px;">${escape(p.detail)}</p>
    <p><a href="${p.link}" style="${btn}">Review and approve</a></p>
  `);
}

// ─── Notification-engine templates ───────────────────────────────────────────
// Subject lines are built by the caller as `[Veerha] {title}` (spec Part 5).

const severityAccent: Record<string, string> = {
  critical: '#dc2626',
  warning: '#ea580c',
  info: '#2563eb',
};

function accentFor(severity?: string): string {
  return severityAccent[String(severity || 'info').toLowerCase()] ?? severityAccent.info;
}

const metaRow = `font-size:13px;color:#64748b;margin:2px 0;`;

/**
 * One notification, one "View in Veerha" button pointing at the exact record
 * (spec Part 5 — "Body has the key details and one button").
 */
export function notificationEmail(p: {
  recipientName?: string;
  title: string;
  body?: string;
  severity?: string;
  category?: string;
  entityType?: string;
  entityId?: string;
  warehouseName?: string;
  link: string;
}) {
  const accent = accentFor(p.severity);
  const details: string[] = [];
  if (p.warehouseName) details.push(`<p style="${metaRow}">Warehouse: ${escape(p.warehouseName)}</p>`);
  if (p.entityType) {
    details.push(
      `<p style="${metaRow}">Record: ${escape(p.entityType)}${p.entityId ? ` · ${escape(p.entityId)}` : ''}</p>`,
    );
  }
  if (p.category) details.push(`<p style="${metaRow}">Area: ${escape(p.category)}</p>`);

  return wrap(`
    <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${accent};">${escape(p.severity || 'info')}</p>
    <h2 style="margin:0 0 16px 0;">${escape(p.title)}</h2>
    ${p.recipientName ? `<p>Hi ${escape(p.recipientName)},</p>` : ''}
    ${p.body ? `<p style="background:#f8fafc;padding:12px 16px;border-left:3px solid ${accent};border-radius:6px;">${escape(p.body)}</p>` : ''}
    ${details.join('')}
    <p><a href="${escape(p.link)}" style="${btn}">View in Veerha</a></p>
  `);
}

/**
 * The batching rule (spec Part 5): low-priority alerts arrive as ONE digest
 * per hour instead of one email each.
 */
export function notificationDigestEmail(p: {
  recipientName?: string;
  periodLabel: string;
  items: Array<{ title: string; body?: string; link: string; severity?: string }>;
  appUrl: string;
}) {
  const rows = p.items
    .map((it) => {
      const accent = accentFor(it.severity);
      return `
        <tr><td style="padding:12px 0;border-bottom:1px solid #eef2f7;">
          <div style="font-weight:600;color:#0f172a;">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${accent};margin-right:8px;"></span>${escape(it.title)}
          </div>
          ${it.body ? `<div style="font-size:13px;color:#475569;margin:4px 0 6px 16px;">${escape(it.body)}</div>` : ''}
          <div style="margin-left:16px;"><a href="${escape(it.link)}" style="font-size:13px;color:#2563eb;">Open</a></div>
        </td></tr>`;
    })
    .join('');

  return wrap(`
    <h2 style="margin:0 0 4px 0;">${escape(String(p.items.length))} alert${p.items.length === 1 ? '' : 's'} in the ${escape(p.periodLabel)}</h2>
    <p style="${metaRow}">Grouped so your inbox stays readable.</p>
    ${p.recipientName ? `<p>Hi ${escape(p.recipientName)},</p>` : ''}
    <table style="width:100%;border-collapse:collapse;margin-top:8px;">${rows}</table>
    <p style="margin-top:20px;"><a href="${escape(`${p.appUrl}/notifications`)}" style="${btn}">View in Veerha</a></p>
  `);
}

/** End-of-day digest (spec Part 5). */
export function dailySummaryEmail(p: {
  recipientName?: string;
  tenantName?: string;
  date: string;
  ordersShipped: number;
  grnsReceived: number;
  pendingApprovals: number;
  lowStockCount: number;
  topAlerts?: Array<{ title: string; severity?: string }>;
  appUrl: string;
}) {
  const stat = (label: string, value: number, accent = '#0f172a') => `
    <td style="padding:12px;background:#f8fafc;border-radius:8px;width:25%;vertical-align:top;">
      <div style="font-size:22px;font-weight:700;color:${accent};">${escape(String(value))}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">${escape(label)}</div>
    </td>`;

  const alerts = (p.topAlerts ?? [])
    .slice(0, 5)
    .map(
      (a) =>
        `<li style="margin:4px 0;color:#334155;"><span style="color:${accentFor(a.severity)};">●</span> ${escape(a.title)}</li>`,
    )
    .join('');

  return wrap(`
    <h2 style="margin:0 0 4px 0;">Daily summary${p.tenantName ? ` — ${escape(p.tenantName)}` : ''}</h2>
    <p style="${metaRow}">${escape(p.date)}</p>
    ${p.recipientName ? `<p>Hi ${escape(p.recipientName)},</p>` : ''}
    <table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:12px 0;">
      <tr>
        ${stat('Orders shipped', p.ordersShipped)}
        ${stat('GRNs received', p.grnsReceived)}
        ${stat('Approvals pending', p.pendingApprovals, p.pendingApprovals > 0 ? '#ea580c' : '#0f172a')}
        ${stat('SKUs low on stock', p.lowStockCount, p.lowStockCount > 0 ? '#dc2626' : '#0f172a')}
      </tr>
    </table>
    ${alerts ? `<p style="font-weight:600;margin:20px 0 4px 0;">Top alerts</p><ul style="padding-left:18px;margin:0;">${alerts}</ul>` : ''}
    <p style="margin-top:20px;"><a href="${escape(`${p.appUrl}/`)}" style="${btn}">View in Veerha</a></p>
  `);
}

function escape(s: string | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
