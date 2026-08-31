import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { PrismaService } from '../prisma/prisma.service';
import { templates, type EmailTemplateData, type EmailTemplateKey } from './templates';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly appName: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.appName = config.get<string>('APP_NAME', 'Purse');
    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: Number(config.get<string>('SMTP_PORT', '587')),
      secure: config.get<string>('SMTP_SECURE', 'false') === 'true',
      auth: {
        user: config.getOrThrow<string>('SMTP_USER'),
        pass: config.getOrThrow<string>('SMTP_PASS'),
      },
    });
  }

  async sendTemplate(
    templateKey: EmailTemplateKey,
    to: string,
    data: EmailTemplateData,
    userId?: number,
  ): Promise<void> {
    const rendered = templates[templateKey]({
      ...data,
      appName: data.appName ?? this.appName,
    } as any);
    const log = await this.prisma.emailLog.create({
      data: {
        userId,
        toAddress: to,
        templateKey,
        subject: rendered.subject,
      },
    });

    try {
      const from = process.env.MAIL_FROM ?? process.env.SMTP_USER;
      const result = await this.transporter.sendMail({
        from,
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: 'SENT',
          providerId: result.messageId,
          sentAt: new Date(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email error';
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: 'FAILED', errorMessage: message },
      });
      this.logger.error(`Email delivery failed for ${to}`, error);
      throw error;
    }
  }
}
