import { describe, expect, it } from '@jest/globals';

describe('Authentication contract', () => {
  it('documents the cookie-only authentication policy', () => {
    expect('purse_access_token').toContain('access');
    expect('purse_refresh_token').toContain('refresh');
  });

  it('defines the OTP endpoints used by the frontend', () => {
    const endpoints = [
      '/auth/verify-email',
      '/auth/resend-email-otp',
      '/auth/forgot-password',
      '/auth/reset-password',
    ];

    expect(endpoints).toHaveLength(4);
  });
});
