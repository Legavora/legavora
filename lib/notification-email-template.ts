import 'server-only';

import type {
  NotificationEmailPayload,
} from './notification-email-provider';

const CATEGORY_LABELS = {
  project: 'Project Update',
  editorial: 'Editorial Update',
  production: 'Production Update',
  distribution: 'Distribution Update',
  contract: 'Contract and Agreement',
  invoice: 'Invoice Notification',
  payment: 'Payment Notification',
  staff: 'Staff Notification',
  support: 'Support Update',
  marketing: 'Marketing Campaign Update',
} as const;

export type EmailNotificationCategory =
  keyof typeof CATEGORY_LABELS;

export type NotificationTemplateInput = {
  recipientEmail: string;
  recipientName?: string | null;
  category: EmailNotificationCategory;
  title: string;
  message: string;
  priority?: 'normal' | 'high' | 'urgent' | 'low';
  actionUrl?: string | null;
};

const BRAND = {
  name: 'Legavora',
  company: 'Legavora Global Services Ltd',
  registration: 'RC 10009828',
  tagline: 'Publishing, Marketing & Author Growth',
  sender: 'Legavora <notifications@legavora.com>',
  replyTo: 'hello@legavora.com',
  navy: '#10233e',
  gold: '#c6a56a',
  background: '#f1f3f6',
  text: '#344054',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanSingleLine(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .trim();
}

function getApplicationOrigin(): string {
  const configured =
    process.env.LEGAVORA_APP_URL?.trim();

  if (!configured) {
    throw new Error(
      'Legavora application URL is not configured'
    );
  }

  const url = new URL(configured);

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Invalid Legavora application URL'
    );
  }

  return url.origin;
}

function getSafeActionUrl(
  origin: string,
  actionUrl?: string | null
): string {
  const fallback =
    `${origin}/dashboard/notifications`;

  if (
    !actionUrl ||
    !actionUrl.startsWith('/') ||
    actionUrl.startsWith('//') ||
    /[\\\u0000-\u001f\u007f]/.test(actionUrl)
  ) {
    return fallback;
  }

  try {
    const resolved = new URL(actionUrl, origin);

    if (resolved.origin !== origin) {
      return fallback;
    }

    return resolved.toString();
  } catch {
    return fallback;
  }
}

export function buildNotificationEmail(
  input: NotificationTemplateInput
): NotificationEmailPayload {
  const origin = getApplicationOrigin();

  const recipientEmail =
    input.recipientEmail.trim();

  if (
    recipientEmail.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(
      recipientEmail
    )
  ) {
    throw new Error(
      'Invalid notification recipient email'
    );
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      CATEGORY_LABELS,
      input.category
    )
  ) {
    throw new Error(
      'Unsupported email notification category'
    );
  }

  const title = cleanSingleLine(
    input.title
  ).slice(0, 180);

  const message = input.message.trim();

  if (
    !title ||
    !message ||
    message.length > 10000
  ) {
    throw new Error(
      'Invalid notification email content'
    );
  }

  const recipientName = cleanSingleLine(
    input.recipientName || 'there'
  ).slice(0, 120) || 'there';

  const categoryLabel =
    CATEGORY_LABELS[input.category];

  const actionUrl = getSafeActionUrl(
    origin,
    input.actionUrl
  );

  const preferencesUrl =
    `${origin}/dashboard/notifications?tab=preferences`;

  const year = new Date().getUTCFullYear();

  const priorityNotice =
    input.priority === 'high' ||
    input.priority === 'urgent'
      ? 'Important update'
      : '';

  const safeTitle = escapeHtml(title);
  const safeName = escapeHtml(recipientName);

  const safeMessage = escapeHtml(message)
    .replace(/\r\n|\r|\n/g, '<br>');

  const safeActionUrl = escapeHtml(actionUrl);

  const safePreferencesUrl =
    escapeHtml(preferencesUrl);

  const safeCategory =
    escapeHtml(categoryLabel);

  const subject = `${title} | Legavora`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >
  <title>${safeTitle}</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:${BRAND.background};
  font-family:Arial,Helvetica,sans-serif;
  color:${BRAND.text};
">

<table
  role="presentation"
  width="100%"
  cellspacing="0"
  cellpadding="0"
  border="0"
>
<tr>
<td align="center" style="padding:24px 12px;">

<table
  role="presentation"
  width="100%"
  cellspacing="0"
  cellpadding="0"
  border="0"
  style="
    max-width:620px;
    background:#ffffff;
    border:1px solid #e4e7ec;
    border-radius:12px;
    overflow:hidden;
  "
>

<tr>
<td
  align="center"
  bgcolor="${BRAND.navy}"
  style="padding:32px 20px;"
>
  <div style="
    font-size:30px;
    font-weight:bold;
    letter-spacing:3px;
    color:#ffffff;
  ">
    LEGAVORA
  </div>

  <div style="
    margin-top:10px;
    font-size:11px;
    letter-spacing:1px;
    color:${BRAND.gold};
  ">
    PUBLISHING, MARKETING &amp; AUTHOR GROWTH
  </div>
</td>
</tr>

<tr>
<td
  bgcolor="${BRAND.gold}"
  height="4"
  style="font-size:0;line-height:0;"
>&nbsp;</td>
</tr>

<tr>
<td style="padding:36px 28px;">

  <div style="
    font-size:12px;
    font-weight:bold;
    letter-spacing:1px;
    text-transform:uppercase;
    color:#80652f;
    margin-bottom:14px;
  ">
    ${safeCategory}
  </div>

  ${
    priorityNotice
      ? `
      <div style="
        color:#92400e;
        background:#fffbeb;
        border:1px solid #fde68a;
        border-radius:6px;
        padding:10px 14px;
        font-size:13px;
        margin-bottom:18px;
      ">
        Important update
      </div>
      `
      : ''
  }

  <h1 style="
    font-size:25px;
    line-height:1.35;
    color:${BRAND.navy};
    margin:0 0 24px;
  ">
    ${safeTitle}
  </h1>

  <p style="
    font-size:15px;
    line-height:1.8;
    margin:0 0 18px;
  ">
    Hello ${safeName},
  </p>

  <p style="
    font-size:15px;
    line-height:1.8;
    margin:0 0 24px;
    overflow-wrap:anywhere;
  ">
    ${safeMessage}
  </p>

  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    style="
      background:#f8f9fb;
      border:1px solid #e4e7ec;
      border-radius:8px;
      margin-bottom:28px;
    "
  >
    <tr>
      <td style="padding:18px;">
        <div style="
          font-size:14px;
          font-weight:bold;
          color:${BRAND.navy};
          margin-bottom:8px;
        ">
          Your Legavora workspace
        </div>

        <div style="
          font-size:13px;
          line-height:1.7;
          color:#475467;
        ">
          Sign in securely to review your latest
          updates and any required next steps.
        </div>
      </td>
    </tr>
  </table>

  <table
    role="presentation"
    cellspacing="0"
    cellpadding="0"
    border="0"
    align="center"
    style="margin:0 auto 30px;"
  >
    <tr>
      <td
        bgcolor="${BRAND.navy}"
        style="border-radius:7px;"
      >
        <a
          href="${safeActionUrl}"
          style="
            display:inline-block;
            padding:15px 26px;
            color:#ffffff;
            font-size:14px;
            font-weight:bold;
            text-decoration:none;
          "
        >
          View Your Update
        </a>
      </td>
    </tr>
  </table>

  <p style="
    font-size:14px;
    line-height:1.8;
    margin:0;
  ">
    Kind regards,<br>
    <strong style="color:${BRAND.navy};">
      The Legavora Team
    </strong>
  </p>

</td>
</tr>

<tr>
<td
  align="center"
  style="
    padding:26px 20px;
    background:#f8f9fb;
    border-top:1px solid #e4e7ec;
    font-size:12px;
    line-height:1.8;
    color:#667085;
  "
>

  <strong style="color:${BRAND.navy};">
    ${BRAND.company}
  </strong>

  <br>

  Registered Company &middot; ${BRAND.registration}

  <br>

  <a
    href="mailto:${BRAND.replyTo}"
    style="color:${BRAND.navy};"
  >
    ${BRAND.replyTo}
  </a>

  <p style="margin:16px 0;">
    This is an automated notification relating
    to your Legavora account or services.
  </p>

  <a
    href="${safePreferencesUrl}"
    style="
      color:${BRAND.navy};
      text-decoration:underline;
    "
  >
    Manage Email Preferences
  </a>

  <p style="margin:16px 0 0;">
    &copy; ${year} ${BRAND.company}.
    All rights reserved.
  </p>

</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>
`.trim();

  const text = [
    'LEGAVORA',
    BRAND.tagline,
    '',
    categoryLabel,
    priorityNotice,
    '',
    title,
    '',
    `Hello ${recipientName},`,
    '',
    message,
    '',
    'Sign in securely to review your update:',
    actionUrl,
    '',
    'Kind regards,',
    'The Legavora Team',
    '',
    BRAND.company,
    `Registered Company | ${BRAND.registration}`,
    BRAND.replyTo,
    '',
    'Manage your email preferences:',
    preferencesUrl,
    '',
    `© ${year} ${BRAND.company}.`,
    'All rights reserved.',
  ].join('\n');

  return {
    from: BRAND.sender,
    to: [recipientEmail],
    subject,
    html,
    text,
    reply_to: BRAND.replyTo,
  };
}
