import { deliveryAssignedEmail } from './delivery-assigned.template';
import { deliveryCodeEmail } from './delivery-code.template';
import { deliveryCompletedEmail } from './delivery-completed.template';
import { emailVerificationOtpEmail } from './email-verification-otp.template';
import { kycUpdateEmail } from './kyc-update.template';
import { orderPlacedEmail } from './order-placed.template';
import { orderStatusEmail } from './order-status.template';
import { passwordResetOtpEmail } from './password-reset-otp.template';
import { paymentFailedEmail } from './payment-failed.template';
import { paymentReceivedEmail } from './payment-received.template';
import { systemAnnouncementEmail } from './system-announcement.template';

export type { EmailTemplateData, RenderedEmail } from './_shared';

export const templates = {
  emailVerificationOtp: emailVerificationOtpEmail,
  passwordResetOtp: passwordResetOtpEmail,
  orderPlaced: orderPlacedEmail,
  orderStatus: orderStatusEmail,
  paymentReceived: paymentReceivedEmail,
  paymentFailed: paymentFailedEmail,
  deliveryAssigned: deliveryAssignedEmail,
  deliveryCode: deliveryCodeEmail,
  deliveryCompleted: deliveryCompletedEmail,
  kycUpdate: kycUpdateEmail,
  systemAnnouncement: systemAnnouncementEmail,
} as const;

export type EmailTemplateKey = keyof typeof templates;
