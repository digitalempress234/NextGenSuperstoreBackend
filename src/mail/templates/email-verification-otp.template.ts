import { renderOtpEmail, type OtpEmailTemplateData } from './otp.shared';

export function emailVerificationOtpEmail(data: OtpEmailTemplateData) {
  return renderOtpEmail('Verify your email', 'Email verification code', data);
}
