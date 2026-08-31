import { renderOtpEmail, type OtpEmailTemplateData } from './otp.shared';

export function passwordResetOtpEmail(data: OtpEmailTemplateData) {
  return renderOtpEmail('Reset your password', 'Password reset code', data);
}
