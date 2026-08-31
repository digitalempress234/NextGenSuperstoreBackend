describe('OTP logging configuration', () => {
  it('defaults to logging OTP codes', () => {
    expect(process.env.LOG_OTP_CODES ?? 'true').toBeTruthy();
  });

  it('supports explicitly disabling OTP code logging', () => {
    process.env.LOG_OTP_CODES = 'false';

    expect(process.env.LOG_OTP_CODES).toBe('false');
  });
});
