# Production Checklist

- [ ] Set strong JWT secrets.
- [ ] Set production MySQL credentials and encrypted backups.
- [ ] Set Redis authentication/TLS where required.
- [ ] Configure Paystack live secret and webhook URL.
- [ ] Configure Cloudinary credentials and restricted KYC delivery policy.
- [ ] Configure SMTP.
- [ ] Configure CORS to exact frontend origins.
- [ ] Put API behind TLS reverse proxy/WAF.
- [ ] Enable monitoring, alerting and centralized logs.
- [ ] Run Prisma migrations before application rollout.
- [ ] Test payment webhook idempotency.
- [ ] Test database restore procedure.
- [ ] Change/remove seeded admin credentials.
- [ ] Add automated database backups.
