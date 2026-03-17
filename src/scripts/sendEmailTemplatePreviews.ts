import { env } from '../config/environment';
import { emailService } from '../services/emailService';

type PreviewEmail = {
  subject: string;
  text: string;
  html: string;
};

const to = (process.argv[2] || 'yuriwarp@gmail.com').trim().toLowerCase();
const appBaseUrl =
  env.APP_BASE_URL?.replace(/\/$/, '') || 'https://subslush.com';
const dashboardLink = `${appBaseUrl}/dashboard/orders`;
const helpLink = `${appBaseUrl}/help`;
const browseLink = `${appBaseUrl}/browse`;

const sendPreview = async (email: PreviewEmail): Promise<void> => {
  const result = await emailService.send({
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    from: 'no-reply@subslush.com',
  });

  if (!result.success) {
    throw new Error(`${email.subject}: ${result.error || 'send failed'}`);
  }
  console.log(`[SENT] ${email.subject}`);
};

const buildPreviewBatch = (): PreviewEmail[] => {
  const claimLink = `${appBaseUrl}/checkout/claim?token=preview-token`;

  return [
    {
      subject: '[Preview] Auth - Reset your password',
      text: `We received a request to reset your password.\n\nReset your password: ${appBaseUrl}/auth/reset-password?token=preview-token\n\nIf you did not request this, you can safely ignore this email.`,
      html: emailService.buildBrandedEmail({
        title: 'Reset your password',
        intro: 'We received a request to reset your SubSlush password.',
        bodyHtml: `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#334155;">Use the secure button below to set a new password.</td>
            </tr>
          </table>
        `.trim(),
        ctaLabel: 'Reset password',
        ctaUrl: `${appBaseUrl}/auth/reset-password?token=preview-token`,
        note: 'If you did not request this, you can safely ignore this email.',
        previewText: 'Reset your SubSlush password',
      }),
    },
    {
      subject: '[Preview] Auth - Confirm checkout email',
      text: `Use the link below to confirm your email for this checkout:\n\n${claimLink}\n\nIf you did not request this, you can ignore this email.`,
      html: emailService.buildBrandedEmail({
        title: 'Confirm your checkout email',
        intro:
          'Use the secure link below to confirm your email for this checkout session.',
        bodyHtml: `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#334155;">
                This verification link is one-time use and expires automatically.
              </td>
            </tr>
          </table>
        `.trim(),
        ctaLabel: 'Confirm checkout email',
        ctaUrl: claimLink,
        note: 'If you did not request this, you can ignore this email.',
        previewText: 'Confirm your SubSlush checkout email',
      }),
    },
    {
      subject: '[Preview] Order - Payment received',
      text: `We received your payment for order 3f8a91c2.\nOrder delivery is usually completed within 24 hours during business days.\nIn some cases, delivery can take up to 72 hours.\n\nOrder items:\n- Netflix Premium · 12 months\n- Spotify Family · 6 months`,
      html: emailService.buildBrandedEmail({
        title: 'Payment received',
        intro:
          'We received your payment for order 3f8a91c2. Delivery is usually completed within 24 hours on business days, and can take up to 72 hours in some cases.',
        bodyHtml: `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#334155;">
                <div style="font-weight:600;color:#0f172a;margin-bottom:8px;">Order items</div>
                <ul style="margin:0;padding-left:18px;">
                  <li style="margin-bottom:6px;">Netflix Premium · 12 months</li>
                  <li>Spotify Family · 6 months</li>
                </ul>
              </td>
            </tr>
          </table>
        `.trim(),
        ctaLabel: 'View My Orders',
        ctaUrl: dashboardLink,
        note: `Need help? ${helpLink}`,
        previewText: 'Payment received for order 3f8a91c2',
      }),
    },
    {
      subject: '[Preview] Order - Delivered',
      text: `Your order 3f8a91c2 has been delivered and is now active.\n\nOpen My Orders: ${dashboardLink}`,
      html: emailService.buildBrandedEmail({
        title: 'Order delivered',
        intro: 'Your order 3f8a91c2 has been delivered and is now active.',
        bodyHtml: `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#334155;">
                <div style="font-weight:600;color:#0f172a;margin-bottom:8px;">Subscriptions activated</div>
                <ul style="margin:0;padding-left:18px;">
                  <li style="margin-bottom:6px;">Netflix Premium · 12 months</li>
                  <li>Spotify Family · 6 months</li>
                </ul>
              </td>
            </tr>
          </table>
        `.trim(),
        ctaLabel: 'View My Orders',
        ctaUrl: dashboardLink,
        note: `Need help? ${helpLink}`,
        previewText: 'Order delivered',
      }),
    },
    {
      subject: '[Preview] Order - Delivered (claim required)',
      text: `Your order 3f8a91c2 has been delivered.\nClaim it within 72 hours: ${claimLink}`,
      html: emailService.buildBrandedEmail({
        title: 'Order delivered - claim required',
        intro:
          'Your order 3f8a91c2 has been delivered. Claim it within 72 hours to access credentials and activation instructions.',
        bodyHtml: `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 14px;background-color:#fff7ed;border:1px solid #fdba74;border-radius:10px;">
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#7c2d12;">This claim link is one-time use and expires in 72 hours.</td>
            </tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#334155;">
                <div style="font-weight:600;margin-bottom:8px;color:#0f172a;">Manage this order in your account</div>
                <div style="margin-bottom:8px;">Create a SubSlush account (or sign in) with this same email address.</div>
                <div>After claiming, open My Orders and click <strong>Reveal credentials</strong>.</div>
              </td>
            </tr>
          </table>
        `.trim(),
        ctaLabel: 'Claim order now',
        ctaUrl: claimLink,
        note: `Need help? ${helpLink}`,
        previewText: 'Order delivered - claim required',
      }),
    },
    {
      subject: '[Preview] Newsletter - Welcome coupon',
      text: `Welcome to SubSlush.\nPremium subscriptions for less, and you just unlocked 12% off your first order.\n\nCoupon code: WELCOME12\nValid for 7 days\n\nStart browsing: ${browseLink}`,
      html: emailService.buildBrandedEmail({
        title: 'Welcome to SubSlush',
        intro:
          'Premium subscriptions for less, and you just unlocked 12% off your first order.',
        bodyHtml: `
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <tr>
              <td style="padding:16px;text-align:center;">
                <div style="font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:0.08em;">Coupon code</div>
                <div style="margin-top:8px;font-size:28px;font-weight:800;letter-spacing:0.12em;color:#0f172a;">WELCOME12</div>
                <div style="margin-top:10px;font-size:12px;color:#64748b;">12% off your first order · Valid for 7 days</div>
              </td>
            </tr>
          </table>
        `.trim(),
        ctaLabel: 'Start browsing',
        ctaUrl: browseLink,
        note: 'This code can only be used once on your first purchase.',
        previewText: 'Your 12% off first-order coupon',
      }),
    },
  ];
};

const main = async (): Promise<void> => {
  if (!to || !to.includes('@')) {
    throw new Error('Provide a valid target email as the first argument.');
  }

  console.log(`Sending email template previews to ${to}...`);

  const passwordResetResult = await emailService.sendPasswordResetEmail({
    to,
    resetLink: `${appBaseUrl}/auth/reset-password?token=preview-token`,
  });
  if (!passwordResetResult.success) {
    throw new Error(
      `Password reset preview failed: ${passwordResetResult.error || 'send failed'}`
    );
  }
  console.log('[SENT] [Preview] Auth - Reset your password (service method)');

  const previews = buildPreviewBatch();
  for (const preview of previews) {
    await sendPreview(preview);
  }

  console.log('All preview emails sent successfully.');
};

void main().catch(error => {
  console.error('Failed to send preview emails:', error);
  process.exitCode = 1;
});
