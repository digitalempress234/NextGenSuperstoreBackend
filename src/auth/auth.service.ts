import { AppLoggerService } from '../logging/app-logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { parsePhoneNumberWithError } from 'libphonenumber-js/max';

import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RbacService } from '../rbac/rbac.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResendEmailOtpDto,
  ResetPasswordDto,
  VerifyEmailOtpDto,
} from './dto/auth.dto';


type OtpPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly rbac: RbacService,
    private readonly mail: MailService,
    private readonly redis: RedisService,
    private readonly logger: AppLoggerService,
  ) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      throw new ConflictException('Email already exists.');
    }

    const customerRole = await this.prisma.role.findUnique({
      where: { name: 'CUSTOMER' },
    });

    const normalizedPhone = input.phoneNumber
      ? parsePhoneNumberWithError(input.phoneNumber, 'NG').number
      : undefined;

    if (normalizedPhone) {
      const phoneOwner = await this.prisma.user.findFirst({
        where: { phoneNumber: normalizedPhone },
        select: { id: true },
      });
      if (phoneOwner) {
        throw new ConflictException('Phone number already exists.');
      }
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNumber: normalizedPhone,
        roles: customerRole
          ? {
              create: [{ roleId: customerRole.id }],
            }
          : undefined,
      },
    });

    await this.createAndSendOtp(user.id, email, 'EMAIL_VERIFICATION', user.firstName ?? undefined);

    return {
      user: { id: user.id, email: user.email },
      verificationRequired: true,
    };
  }

  async login(input: LoginDto) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!validPassword || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials or inactive account.');
    }

    if (!user.isEmailVerified) {
      await this.createAndSendOtp(user.id, email, 'EMAIL_VERIFICATION', user.firstName ?? undefined);
      throw new UnauthorizedException('Email verification is required. A new verification code has been sent.');
    }

    return this.issueTokens(user.id, user.email);
  }

  async verifyEmailOtp(input: VerifyEmailOtpDto) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException('Invalid verification request.');
    }

    await this.consumeOtp(user.id, email, 'EMAIL_VERIFICATION', input.otp);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true },
    });

    return { verified: true };
  }

  async resendEmailOtp(input: ResendEmailOtpDto) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, isEmailVerified: true },
    });

    // Do not reveal whether an email exists.
    if (!user || user.isEmailVerified) {
      return { accepted: true };
    }

    try {
      await this.createAndSendOtp(user.id, email, 'EMAIL_VERIFICATION', user.firstName ?? undefined);
    } catch {
      // Do not reveal whether the account exists or whether a cooldown is active.
    }
    return { accepted: true };
  }

  async forgotPassword(input: ForgotPasswordDto) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, firstName: true, status: true },
    });

    if (user && user.status === 'ACTIVE') {
      try {
        await this.createAndSendOtp(user.id, email, 'PASSWORD_RESET', user.firstName ?? undefined);
      } catch {
        // Mail delivery failures are logged by MailService; do not expose account state.
      }
    }

    return { accepted: true };
  }

  async resetPassword(input: ResetPasswordDto) {
    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== 'ACTIVE') {
      throw new BadRequestException('Invalid password reset request.');
    }

    await this.consumeOtp(user.id, email, 'PASSWORD_RESET', input.otp);
    const passwordHash = await bcrypt.hash(input.password, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      this.prisma.adminSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { passwordReset: true };
  }

  async logout(sessionId: number): Promise<void> {
    await this.prisma.adminSession.updateMany({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: number; sid: number }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      const session = await this.prisma.adminSession.findUnique({ where: { id: payload.sid } });
      if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
        throw new UnauthorizedException('Session has expired or been revoked.');
      }

      return this.issueTokens(session.userId, await this.getUserEmail(session.userId), session.id);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh session.');
    }
  }

  async createSessionForUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, isEmailVerified: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active.');
    }

    return this.issueTokens(user.id, user.email);
  }

  async updateSessionMetadata(
    sessionId: number,
    request: { ip?: string; headers?: { 'user-agent'?: string } },
  ): Promise<void> {
    await this.prisma.adminSession.update({
      where: { id: sessionId },
      data: {
        ipAddress: request.ip,
        userAgent: request.headers?.['user-agent'],
        lastSeenAt: new Date(),
      },
    });
  }

  private async getUserEmail(userId: number): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active.');
    }

    return user.email;
  }

  private async issueTokens(userId: number, email: string, existingSessionId?: number) {
    const sessionSecret = randomBytes(32).toString('hex');
    const sessionTokenHash = createHash('sha256').update(sessionSecret).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const session = existingSessionId
      ? await this.prisma.adminSession.update({
          where: { id: existingSessionId },
          data: { sessionTokenHash, lastSeenAt: new Date(), expiresAt, revokedAt: null },
        })
      : await this.prisma.adminSession.create({
          data: { userId, sessionTokenHash, expiresAt },
        });

    const claims = { sub: userId, email, sid: session.id };
    const accessToken = await this.jwtService.signAsync(claims, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as any,
    });
    const refreshToken = await this.jwtService.signAsync(
      { sub: userId, sid: session.id },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '30d') as any,
      },
    );

    const access = await this.rbac.buildUserContext(userId);
    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
      user: { id: userId, email, roles: access.roles, permissions: access.permissions },
    };
  }

  private async createAndSendOtp(
    userId: number,
    email: string,
    purpose: OtpPurpose,
    recipientName?: string,
  ): Promise<void> {
    const otpTtlMinutes = Number(this.config.get<string>('OTP_TTL_MINUTES', '10'));
    const cooldownSeconds = Number(this.config.get<string>('OTP_COOLDOWN_SECONDS', '60'));
    const maxAttempts = Number(this.config.get<string>('OTP_MAX_ATTEMPTS', '5'));
    const cooldownKey = `otp:cooldown:${purpose}:${email}`;
    const cooldown = await this.redis.client.get(cooldownKey);
    if (cooldown) {
      throw new HttpException('Please wait before requesting another OTP.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // A user can have only one active OTP per purpose. Resend replaces it.
    await this.prisma.otpChallenge.deleteMany({
      where: {
        userId,
        purpose,
      },
    });

    const otp = randomInt(100000, 1000000).toString();
    this.logger.otp('auth.otp.created', {
      purpose: 'otp',
      code: otp,
    });

    const expiresAt = new Date(Date.now() + otpTtlMinutes * 60_000);
    const challengeKey = randomBytes(24).toString('hex');

    const challenge = await this.prisma.otpChallenge.create({
      data: {
        userId,
        purpose,
        target: email,
        challengeKey,
        codeHash: this.hashOtp(challengeKey, otp),
        expiresAt,
        maxAttempts,
      },
    });

    await this.redis.client.set(cooldownKey, '1', 'EX', cooldownSeconds);
    const templateKey =
      purpose === 'EMAIL_VERIFICATION'
        ? 'emailVerificationOtp'
        : 'passwordResetOtp';

    try {
      await this.mail.sendTemplate(
        templateKey,
        email,
        { recipientName, otp, expiresInMinutes: otpTtlMinutes },
        userId,
      );
    } catch (error) {
      await this.prisma.otpChallenge.delete({
        where: { id: challenge.id },
      });
      throw error;
    }
  }

  private async consumeOtp(
    userId: number,
    email: string,
    purpose: OtpPurpose,
    otp: string,
  ): Promise<void> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        userId,
        purpose,
        target: email,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!challenge) {
      throw new BadRequestException('OTP is invalid or has expired.');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      throw new HttpException('OTP attempt limit reached. Request a new code.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const expectedHash = this.hashOtp(challenge.challengeKey, otp);

    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const actualBuffer = Buffer.from(challenge.codeHash, 'hex');
    const matches =
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer);

    if (!matches) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('OTP is invalid or has expired.');
    }

    const deleted = await this.prisma.otpChallenge.deleteMany({
      where: { id: challenge.id },
    });

    if (deleted.count !== 1) {
      throw new BadRequestException('OTP is invalid or has expired.');
    }
  }

  private hashOtp(challengeId: string, otp: string): string {
    const pepper = this.config.getOrThrow<string>('OTP_PEPPER');
    return createHash('sha256').update(`${pepper}:${challengeId}:${otp}`).digest('hex');
  }
}
