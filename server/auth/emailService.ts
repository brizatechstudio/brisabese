import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface EmailService {
  sendEmail(message: EmailMessage): Promise<boolean>;
  sendVerificationEmail(to: string, token: string, redirectUrl?: string): Promise<boolean>;
  sendPasswordResetEmail(to: string, token: string, redirectUrl?: string): Promise<boolean>;
  sendWelcomeEmail(to: string, name: string): Promise<boolean>;
  sendSecurityAlert(to: string, alertType: string, details: string): Promise<boolean>;
  healthCheck(): Promise<{ status: 'ok' | 'degraded'; disabled?: boolean }>;
}

export class SmtpEmailService implements EmailService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    if (!config.smtp.enabled) throw new Error('[BRISABASE MAIL ERROR] SMTP is disabled by SMTP_ENABLED=false.');
    if (!config.smtp.host) throw new Error('[BRISABASE MAIL ERROR] SMTP_HOST is required.');
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.password } : undefined,
    });
    return this.transporter;
  }

  public async sendEmail(message: EmailMessage): Promise<boolean> {
    await this.getTransporter().sendMail({ from: config.smtp.from, to: message.to, subject: message.subject, text: message.body, html: message.html });
    return true;
  }

  public async sendVerificationEmail(to: string, token: string, redirectUrl?: string): Promise<boolean> {
    const link = redirectUrl ? `${redirectUrl}?token=${encodeURIComponent(token)}` : `${config.appUrl || 'http://localhost:3000'}/auth/v1/verify-email?token=${encodeURIComponent(token)}`;
    return this.sendEmail({ to, subject: 'Confirme seu e-mail — BrisaBase', body: `Confirme seu e-mail: ${link}`, html: `<p>Confirme seu e-mail em <a href="${link}">BrisaBase</a>.</p>` });
  }

  public async sendPasswordResetEmail(to: string, token: string, redirectUrl?: string): Promise<boolean> {
    const link = redirectUrl ? `${redirectUrl}?token=${encodeURIComponent(token)}` : `${config.appUrl || 'http://localhost:3000'}/auth/v1/password-reset?token=${encodeURIComponent(token)}`;
    return this.sendEmail({ to, subject: 'Redefinição de senha — BrisaBase', body: `Redefina sua senha: ${link}`, html: `<p>Redefina sua senha em <a href="${link}">BrisaBase</a>.</p>` });
  }

  public async sendWelcomeEmail(to: string, name: string): Promise<boolean> {
    return this.sendEmail({ to, subject: 'Bem-vindo ao BrisaBase', body: `Olá ${name}, sua conta está pronta.`, html: `<h2>Bem-vindo, ${name}!</h2><p>Sua conta está pronta.</p>` });
  }

  public async sendSecurityAlert(to: string, alertType: string, details: string): Promise<boolean> {
    return this.sendEmail({ to, subject: `[Segurança] ${alertType}`, body: details });
  }

  public async healthCheck(): Promise<{ status: 'ok' | 'degraded'; disabled?: boolean }> {
    if (!config.smtp.enabled) return { status: 'ok', disabled: true };
    try {
      await this.getTransporter().verify();
      return { status: 'ok' };
    } catch {
      return { status: 'degraded' };
    }
  }
}

export const emailService = new SmtpEmailService();
