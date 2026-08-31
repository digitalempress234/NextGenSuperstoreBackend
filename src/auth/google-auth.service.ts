import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

interface GoogleClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  picture?: string;
  iss?: string;
  aud?: string | string[];
}

@Injectable()
export class GoogleAuthService {
  private readonly client: OAuth2Client;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {
    this.client = new OAuth2Client();
  }

  async signIn(idToken: string) {
    const audience = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience,
    });
    const payload = ticket.getPayload() as GoogleClaims | undefined;

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Google account could not be verified.');
    }

    const issuerValid =
      payload.iss === 'accounts.google.com' || payload.iss === 'https://accounts.google.com';
    const audienceValid = Array.isArray(payload.aud)
      ? payload.aud.includes(audience)
      : payload.aud === audience;

    if (!issuerValid || !audienceValid || payload.email_verified !== true) {
      throw new UnauthorizedException('Google identity verification failed.');
    }

    const email = payload.email.trim().toLowerCase();

    const existingOAuth = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'GOOGLE',
          providerAccountId: payload.sub,
        },
      },
      include: { user: true },
    });

    if (existingOAuth) {
      if (existingOAuth.user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account is not active.');
      }

      return this.auth.createSessionForUser(existingOAuth.user.id);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: { oauthAccounts: true },
    });

    const user = await this.prisma.$transaction(async (tx) => {
      let account = existingUser;

      if (!account) {
        const customerRole = await tx.role.findUnique({
          where: { name: 'CUSTOMER' },
        });

        account = await tx.user.create({
          data: {
            email,
            firstName: payload.given_name,
            lastName: payload.family_name,
            avatarUrl: payload.picture,
            isEmailVerified: true,
            roles: customerRole ? { create: [{ roleId: customerRole.id }] } : undefined,
          },
          include: { oauthAccounts: true },
        });
      } else if (!account.isEmailVerified) {
        account = await tx.user.update({
          where: { id: account.id },
          data: {
            isEmailVerified: true,
            firstName: account.firstName ?? payload.given_name,
            lastName: account.lastName ?? payload.family_name,
            avatarUrl: account.avatarUrl ?? payload.picture,
          },
          include: { oauthAccounts: true },
        });
      }

      if (account.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account is not active.');
      }

      const alreadyLinked = account.oauthAccounts.some((oauth) => oauth.provider === 'GOOGLE');

      if (alreadyLinked) {
        return account;
      }

      await tx.oAuthAccount.create({
        data: {
          userId: account.id,
          provider: 'GOOGLE',
          providerAccountId: payload.sub,
          email,
        },
      });

      return account;
    });

    return this.auth.createSessionForUser(user.id);
  }
}
