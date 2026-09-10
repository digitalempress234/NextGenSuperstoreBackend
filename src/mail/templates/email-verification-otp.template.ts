import { renderOtpEmail } from './otp.shared';
import type { EmailTemplateData, RenderedEmail } from './_shared';

export function emailVerificationOtpEmail(data: EmailTemplateData): RenderedEmail {
  return renderOtpEmail(
    'Verify Your Email Address',
    'Email Verification',
    {
      recipientName:    data.recipientName ?? data.firstName,
      otp:              String(data.otp ?? ''),
      expiresInMinutes: Number(data.expiresInMinutes ?? 10),
      appName:          String(data.appName ?? 'Superstore'),
    },
  );
}
