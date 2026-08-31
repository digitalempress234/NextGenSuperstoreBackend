import { templates } from '../src/mail/templates';

describe('delivery code email template', () => {
  it('is registered as its own template', () => {
    expect(typeof templates.deliveryCode).toBe('function');
  });

  it('renders a dedicated delivery code email', () => {
    const email = templates.deliveryCode({
      appName: 'Purse',
      firstName: 'Ada',
      orderNumber: 'ORD-10001',
      code: '123456',
      expiresInMinutes: 180,
    });

    expect(email.subject).toContain('ORD-10001');
    expect(email.text).toContain('123456');
    expect(email.html).toContain('123456');
    expect(email.text).toContain('Do not share this code');
  });
});
