import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/environment';
import { Logger } from '../utils/logger';

type EmailSendResult = {
  success: boolean;
  error?: string;
};

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
};

type BrandedEmailOptions = {
  title: string;
  intro?: string;
  bodyHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  note?: string;
  previewText?: string;
};

class EmailService {
  private readonly provider: 'smtp' | 'console' | 'resend';
  private readonly fromAddress: string | null;
  private readonly replyTo?: string | null;
  private transporter: Transporter | null = null;

  constructor() {
    this.provider = env.EMAIL_PROVIDER;
    this.fromAddress = this.normalizeFromAddress(env.EMAIL_FROM || null);
    this.replyTo = env.EMAIL_REPLY_TO || null;

    if (this.provider === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth:
          env.SMTP_USER && env.SMTP_PASSWORD
            ? {
                user: env.SMTP_USER,
                pass: env.SMTP_PASSWORD,
              }
            : undefined,
        connectionTimeout: env.SMTP_CONNECTION_TIMEOUT,
        greetingTimeout: env.SMTP_GREETING_TIMEOUT,
        socketTimeout: env.SMTP_SOCKET_TIMEOUT,
      });
    }
  }

  buildBrandedEmail(options: BrandedEmailOptions): string {
    const title = this.escapeHtml(options.title);
    const intro = options.intro ? this.escapeHtml(options.intro) : '';
    const note = options.note ? this.escapeHtml(options.note) : '';
    const previewText = this.escapeHtml(options.previewText || options.title);
    const ctaLabel = options.ctaLabel ? this.escapeHtml(options.ctaLabel) : '';
    const ctaUrl = options.ctaUrl ? this.escapeHtml(options.ctaUrl) : '';
    const bodyHtml = options.bodyHtml || '';
    const year = new Date().getFullYear();
    const appBase = env.APP_BASE_URL?.replace(/\/$/, '') || '';
    const helpUrl = appBase ? `${appBase}/help` : '/help';

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${title}</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a;">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
            ${previewText}
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f1f5f9;padding:24px 0;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" width="640" style="max-width:640px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 18px 35px rgba(15,23,42,0.12);">
                  <tr>
                    <td style="padding:24px 28px;background:linear-gradient(90deg,#7e22ce 0%,#db2777 100%);color:#ffffff;text-align:center;">
                      <div style="font-size:26px;font-weight:800;letter-spacing:0.3px;line-height:1.1;text-align:center;">
                        SubSlush
                      </div>
                      <div style="font-size:12px;line-height:1.4;opacity:0.92;margin-top:5px;text-align:center;">
                        Premium subscriptions for less
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:26px 28px 20px;">
                      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#0f172a;">${title}</h1>
                      ${
                        intro
                          ? `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#334155;">${intro}</p>`
                          : ''
                      }
                      ${bodyHtml}
                      ${
                        ctaLabel && ctaUrl
                          ? `
                            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
                              <tr>
                                <td>
                                  <a href="${ctaUrl}" style="display:inline-block;background:linear-gradient(90deg,#7e22ce 0%,#db2777 100%);color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:10px;font-size:14px;font-weight:700;">
                                    ${ctaLabel}
                                  </a>
                                </td>
                              </tr>
                            </table>
                          `
                          : ''
                      }
                      ${
                        note
                          ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:#64748b;">${note}</p>`
                          : ''
                      }
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">
                      Need help? Contact us via live chat or
                      <a href="mailto:hello@subslush.com" style="color:#7e22ce;font-weight:600;text-decoration:underline;">hello@subslush.com</a>.
                      <span style="display:block;margin-top:4px;">
                        You can also visit our
                        <a href="${helpUrl}" style="color:#7e22ce;font-weight:600;text-decoration:underline;">help center</a>.
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:14px 28px;background-color:#ffffff;text-align:center;font-size:11px;color:#94a3b8;">
                      &copy; ${year} SubSlush. All rights reserved.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `.trim();
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    const fromAddress = payload.from
      ? this.normalizeFromAddress(payload.from)
      : this.fromAddress;

    if (this.provider === 'console') {
      Logger.info('Email dispatch (console mode)', {
        to: payload.to,
        subject: payload.subject,
        textPreview: payload.text.slice(0, 200),
      });
      return { success: true };
    }

    if (this.provider === 'resend') {
      if (!env.RESEND_API_KEY) {
        return {
          success: false,
          error: 'Resend API key not configured',
        };
      }
      if (!fromAddress) {
        return {
          success: false,
          error: 'Email sender address not configured',
        };
      }

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: payload.to,
            subject: payload.subject,
            text: payload.text,
            ...(payload.html ? { html: payload.html } : {}),
            ...(this.replyTo ? { reply_to: this.replyTo } : {}),
          }),
        });

        if (!response.ok) {
          const responseText = await response.text();
          Logger.error('Resend API email failed', {
            status: response.status,
            body: responseText,
          });
          return {
            success: false,
            error: 'Failed to send email',
          };
        }

        return { success: true };
      } catch (error) {
        Logger.error('Resend API email failed', error);
        return {
          success: false,
          error: 'Failed to send email',
        };
      }
    }

    if (!this.transporter) {
      return {
        success: false,
        error: 'Email transport not configured',
      };
    }

    if (!fromAddress) {
      return {
        success: false,
        error: 'Email sender address not configured',
      };
    }

    try {
      await this.transporter.sendMail({
        from: fromAddress,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
      });

      return { success: true };
    } catch (error) {
      Logger.error('Email dispatch failed:', error);
      return {
        success: false,
        error: 'Failed to send email',
      };
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private normalizeFromAddress(address: string | null): string | null {
    if (!address) return null;
    if (address.includes('<')) return address;
    if (/^[^\s<>]+@[^\s<>]+$/.test(address)) {
      return `SubSlush <${address}>`;
    }
    return address;
  }

  async sendPasswordResetEmail(params: {
    to: string;
    resetLink: string;
  }): Promise<EmailSendResult> {
    const subject = env.PASSWORD_RESET_EMAIL_SUBJECT || 'Reset your password';
    const text = [
      'We received a request to reset your password.',
      '',
      `Reset your password: ${params.resetLink}`,
      '',
      'If you did not request this, you can safely ignore this email.',
    ].join('\n');
    const html = this.buildBrandedEmail({
      title: 'Reset your password',
      intro: 'We received a request to reset your SubSlush password.',
      bodyHtml: `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
          <tr>
            <td style="padding:14px 16px;font-size:13px;color:#334155;">
              Use the secure button below to set a new password.
            </td>
          </tr>
        </table>
      `.trim(),
      ctaLabel: 'Reset password',
      ctaUrl: params.resetLink,
      note: 'If you did not request this, you can safely ignore this email.',
      previewText: 'Reset your SubSlush password',
    });

    return this.send({
      to: params.to,
      subject,
      text,
      html,
    });
  }
}

export const emailService = new EmailService();
