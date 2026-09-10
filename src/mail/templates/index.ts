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
import { vendorApprovalEmail } from './vendor-approval.template';
import { lowStockEmail } from './low-stock.template';
import { staffWelcomeEmail } from './staff-welcome.template';
import { welcomeEmail } from './welcome.template';

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
  vendorApproval: vendorApprovalEmail,
  lowStock: lowStockEmail,
  staffWelcome: staffWelcomeEmail,
  systemAnnouncement: systemAnnouncementEmail,
  welcome: welcomeEmail,
} as const;

export type EmailTemplateKey = keyof typeof templates;
