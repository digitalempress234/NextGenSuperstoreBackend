export const REQUEST_ID_HEADER = 'x-request-id';

export const ALWAYS_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  '*.passwordHash',
  '*.accessToken',
  '*.refreshToken',
  '*.token',
  '*.idToken',
  '*.secret',
  '*.clientSecret',
  '*.apiKey',
  '*.paystackSecretKey',
  '*.cloudinaryApiSecret',
  '*.smtpPass',
  '*.accountNumber',
  '*.bvn',
  '*.nin',
  '*.documentNumber',
  '*.deliveryCodeHash',
];

export const OTP_LOGGING_ENABLED = process.env.LOG_OTP_CODES !== 'false';

export const OTP_REDACT_PATHS = ['*.otp', '*.otpCode', '*.verificationCode'];

export const LOG_REDACT_PATHS = OTP_LOGGING_ENABLED
  ? ALWAYS_REDACT_PATHS
  : [...ALWAYS_REDACT_PATHS, ...OTP_REDACT_PATHS];
