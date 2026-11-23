import { ConfigService } from '@nestjs/config';

import { ReceiptPdfService } from '../src/receipts/receipt-pdf.service';
import type { ReceiptView } from '../src/receipts/receipts.service';
import { paymentReceivedEmail } from '../src/mail/templates/payment-received.template';

describe('OhoO! receipts', () => {
  it('renders a branded PDF document', async () => {
    const service = new ReceiptPdfService(
      new ConfigService({
        APP_NAME: 'OhoO!',
        RECEIPT_SUPPORT_EMAIL: 'support@example.com',
      }),
    );
    const receipt: ReceiptView = {
      id: 1,
      receiptNumber: 'OHO-R-261121-A1B2C3D4',
      status: 'ISSUED',
      scope: 'CUSTOMER',
      currency: 'NGN',
      customer: {
        id: 8,
        name: 'Ada Customer',
        email: 'ada@example.com',
        phone: '+2348012345678',
      },
      payment: {
        id: 31,
        method: 'CARD',
        provider: 'PAYSTACK',
        reference: 'PUR-20-reference',
        paidAt: '2026-11-21T10:00:00.000Z',
      },
      orders: [
        {
          id: 501,
          orderNumber: 'PUR-261121-A1B2C3D4',
          fulfillmentType: 'DELIVERY',
          store: {
            id: 6,
            name: 'Campus Hub',
            email: 'store@example.com',
            phone: '+2348090000000',
            address: 'University Road',
            city: 'Ibadan',
            state: 'Oyo',
          },
          items: [
            {
              id: 1,
              productId: 2,
              storeProductId: 3,
              name: 'Premium long-grain rice 5kg',
              code: 'RICE-5KG',
              image: null,
              quantity: 2,
              unitPrice: '12000.00',
              total: '24000.00',
            },
          ],
          subtotal: '24000.00',
          shippingFee: '1500.00',
          discountAmount: '500.00',
          taxAmount: '0.00',
          total: '25000.00',
        },
      ],
      totals: {
        subtotal: '24000.00',
        shippingFee: '1500.00',
        discountAmount: '500.00',
        taxAmount: '0.00',
        totalAmount: '25000.00',
      },
      refunds: [],
      issuedAt: '2026-11-21T10:00:02.000Z',
      pdfUrl: '/purse/v1/receipts/OHO-R-261121-A1B2C3D4/pdf',
    };

    const document = await service.render(receipt);

    expect(document.subarray(0, 5).toString()).toBe('%PDF-');
    expect(document.length).toBeGreaterThan(10_000);
  });

  it('renders the branded receipt email with receipt details', () => {
    const email = paymentReceivedEmail({
      appName: 'OhoO!',
      firstName: 'Ada',
      orderNumber: 'PUR-261121-A1B2C3D4',
      receiptNumber: 'OHO-R-261121-A1B2C3D4',
      amount: '28500.00',
      reference: 'PUR-20-reference',
      paymentMethod: 'CARD',
      receiptUrl: 'https://example.com/receipts/OHO-R-261121-A1B2C3D4',
    });

    expect(email.subject).toContain('OHO-R-261121-A1B2C3D4');
    expect(email.html).toContain(
      'https://res.cloudinary.com/di8higqd1/image/upload/ohoo/branding/email-logo.png',
    );
    expect(email.html).not.toContain('cid:ohoo-logo');
    expect(email.html).toContain('View your receipt');
    expect(email.text).toContain('Receipt: OHO-R-261121-A1B2C3D4');
  });
});
