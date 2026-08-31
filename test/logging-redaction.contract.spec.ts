describe('logging redaction contract', () => {
  it('documents sensitive fields that must never appear in logs', () => {
    const redactedPaths = [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.passwordHash',
      '*.accessToken',
      '*.refreshToken',
      '*.otp',
      '*.accountNumber',
      '*.bvn',
      '*.nin',
      '*.deliveryCodeHash',
    ];

    expect(redactedPaths).toContain('req.headers.authorization');
    expect(redactedPaths).toContain('*.refreshToken');
    expect(redactedPaths).toContain('*.bvn');
    expect(redactedPaths).toContain('*.deliveryCodeHash');
  });
});
