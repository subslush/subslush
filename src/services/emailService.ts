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
    const html = `
      <p>We received a request to reset your password.</p>
      <p><a href="${params.resetLink}">Reset your password</a></p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `.trim();

    return this.send({
      to: params.to,
      subject,
      text,
      html,
    });
  }
}

export const emailService = new EmailService();
