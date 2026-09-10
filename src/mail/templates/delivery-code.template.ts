import { escapeHtml, infoBox, layout, type EmailTemplateData, type RenderedEmail } from './_shared';

export interface DeliveryCodeTemplateData extends EmailTemplateData {
  orderNumber: string;
  code: string;
  expiresInMinutes: number;
}

export function deliveryCodeEmail(data: DeliveryCodeTemplateData): RenderedEmail {
  const firstName   = escapeHtml(data.firstName ?? 'Customer');
  const orderNumber = escapeHtml(data.orderNumber);
  const appName     = String(data.appName ?? 'Superstore');

  const digits = String(data.code).split('').map(d =>
    `<span style="display:inline-block;width:44px;height:52px;line-height:52px;text-align:center;background:#fff7ed;border:2px solid #fed7aa;border-radius:10px;font-size:28px;font-weight:800;color:#f97316;margin:0 4px;">${escapeHtml(d)}</span>`
  ).join('');

  const subject = ` Delivery code for order ${data.orderNumber} - ${appName}`;

  const text = [
    `Hello ${data.firstName ?? 'Customer'},`,
    '',
    `Your delivery code for order ${data.orderNumber} is: ${data.code}`,
    '',
    'Give this code ONLY to the rider when your order arrives at your door.',
    `The code expires in ${data.expiresInMinutes} minutes after the rider arrives.`,
    '',
    'DO NOT share this code before the rider is at your door.',
    '',
    `Thank you - ${appName} Team`,
  ].join('\n');

  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#1c1917;">
      Hi <strong>${firstName}</strong>,
    </p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#1c1917;">
      Your order <strong>${orderNumber}</strong> is almost here! 
      When the rider arrives at your door, share this delivery code to confirm receipt:
    </p>

    <!-- Code display -->
    <div style="text-align:center;margin:0 0 24px;padding:28px 20px;background:#fff7ed;border-radius:12px;border:1px dashed #fed7aa;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#78716c;margin-bottom:16px;">
         Delivery Confirmation Code
      </div>
      <div style="display:inline-flex;justify-content:center;gap:0;">${digits}</div>
      <div style="margin-top:16px;font-size:13px;color:#78716c;">
         Valid for <strong style="color:#f97316;">${data.expiresInMinutes} minutes</strong> from delivery
      </div>
    </div>

    <!-- Instructions -->
    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1c1917;">How to use your delivery code:</p>
    <ol style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:2;color:#57534e;">
      <li>Wait for the rider to arrive at your address</li>
      <li>Verify the rider's name matches your notification</li>
      <li>Collect and inspect your items</li>
      <li>Share this code with the rider to confirm delivery</li>
    </ol>

    ${infoBox(`
      <strong> Security Warning</strong><br>
      Only share this code <strong>after</strong> you have received your items and are satisfied.
      <strong style="color:#dc2626;">Do NOT share this code before or over the phone.</strong>
      If a rider asks for this code before arriving, contact support immediately.
    `)}

    <p style="margin:24px 0 0;font-size:13px;line-height:1.7;color:#78716c;">
      Issues? Contact <a href="mailto:support@superstore.com" style="color:#f97316;text-decoration:none;">support@superstore.com</a>
    </p>
  `;

  return { subject, text, html: layout('Your Delivery Code', body, appName) };
}
