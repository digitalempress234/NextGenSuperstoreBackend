import type { EmailTemplateData, RenderedEmail } from './_shared';

export interface DeliveryCodeTemplateData extends EmailTemplateData {
  orderNumber: string;
  code: string;
  expiresInMinutes: number;
}

export function deliveryCodeEmail(
  data: DeliveryCodeTemplateData,
): RenderedEmail {
  const subject = `Your delivery code for order ${data.orderNumber}`;

  const text = [
    `Hello ${data.firstName ?? 'Customer'},`,
    '',
    `Your delivery code for order ${data.orderNumber} is: ${data.code}.`,
    '',
    'Give this code to the rider when your order arrives.',
    `The code expires in ${data.expiresInMinutes} minutes.`,
    '',
    'Do not share this code before the rider arrives.',
    '',
    `Thank you,`,
    `${data.appName ?? 'Purse'} Team`,
  ].join('\n');

  const html = `
    <div style="margin:0;padding:32px;background:#f5f7fa;font-family:Arial,sans-serif;color:#1f2937">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
        <h2 style="margin-top:0">Your Delivery Code</h2>

        <p>Hello ${data.firstName ?? 'Customer'},</p>

        <p>
          Your delivery code for order
          <strong>${data.orderNumber}</strong> is:
        </p>

        <div
          style="
            margin:24px 0;
            padding:18px;
            text-align:center;
            background:#f8fafc;
            border:1px solid #e5e7eb;
            border-radius:10px;
            font-size:32px;
            font-weight:700;
            letter-spacing:8px;
          "
        >
          ${data.code}
        </div>

        <p>
          Give this code to the rider when your order arrives.
          The code expires in ${data.expiresInMinutes} minutes.
        </p>

        <p>
          <strong>For your security, do not share this code before the rider arrives.</strong>
        </p>

        <p style="color:#6b7280;font-size:13px">
          If you did not expect this delivery, contact support immediately.
        </p>
      </div>
    </div>
  `;

  return { subject, text, html };
}
