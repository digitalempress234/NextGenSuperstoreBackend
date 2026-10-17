import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from './auth.service';

@Injectable()
export class PasskeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  private rpId() {
    return this.config.getOrThrow<string>('WEBAUTHN_RP_ID');
  }

  private origins() {
    const values = this.config
      .getOrThrow<string>('WEBAUTHN_ORIGINS')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (!values.length) throw new Error('WEBAUTHN_ORIGINS must contain at least one origin.');
    return values;
  }

  async registrationOptions(userId: number, label?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { passkeyCredentials: true },
    });
    const options = await generateRegistrationOptions({
      rpName: this.config.get<string>('APP_NAME', 'Purse'),
      rpID: this.rpId(),
      userID: new TextEncoder().encode(String(user.id)),
      userName: user.email,
      userDisplayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      excludeCredentials: user.passkeyCredentials.map((credential) => ({
        id: credential.credentialId,
        transports: (credential.transports as string[] | null) ?? undefined,
      })),
    });
    await this.redis.set(
      `webauthn:register:${userId}`,
      { challenge: options.challenge, label },
      300,
    );
    return options;
  }

  async verifyRegistration(
    userId: number,
    response: RegistrationResponseJSON,
    requestedLabel?: string,
  ) {
    const pending = await this.redis.get<{ challenge: string; label?: string }>(
      `webauthn:register:${userId}`,
    );
    if (!pending) throw new BadRequestException('Passkey registration challenge expired.');
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: this.origins(),
      expectedRPID: this.rpId(),
      requireUserVerification: true,
    });
    if (!result.verified || !result.registrationInfo) {
      throw new BadRequestException('Passkey registration could not be verified.');
    }
    const info = result.registrationInfo;
    const credential = await this.prisma.passkeyCredential.create({
      data: {
        userId,
        credentialId: info.credential.id,
        publicKey: Buffer.from(info.credential.publicKey),
        counter: BigInt(info.credential.counter),
        transports: (response.response.transports ?? info.credential.transports ?? []) as string[],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        label: requestedLabel ?? pending.label,
      },
    });
    await this.redis.del(`webauthn:register:${userId}`);
    return { id: credential.id, label: credential.label, createdAt: credential.createdAt };
  }

  async authenticationOptions() {
    const options = await generateAuthenticationOptions({
      rpID: this.rpId(),
      userVerification: 'required',
      allowCredentials: [],
    });
    await this.redis.set(`webauthn:login:${options.challenge}`, true, 300);
    return options;
  }

  async verifyAuthentication(challenge: string, response: AuthenticationResponseJSON) {
    const pending = await this.redis.get<boolean>(`webauthn:login:${challenge}`);
    if (!pending) throw new UnauthorizedException('Passkey login challenge expired.');
    const stored = await this.prisma.passkeyCredential.findUnique({
      where: { credentialId: response.id },
      include: { user: true },
    });
    if (!stored) throw new NotFoundException('Passkey is not registered.');
    if (stored.user.status !== 'ACTIVE') throw new UnauthorizedException('Account is not active.');
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.origins(),
      expectedRPID: this.rpId(),
      requireUserVerification: true,
      credential: {
        id: stored.credentialId,
        publicKey: new Uint8Array(stored.publicKey),
        counter: Number(stored.counter),
        transports: (stored.transports as string[] | null) ?? undefined,
      },
    });
    if (!result.verified) throw new UnauthorizedException('Passkey login could not be verified.');
    await this.prisma.passkeyCredential.update({
      where: { id: stored.id },
      data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date() },
    });
    await this.redis.del(`webauthn:login:${challenge}`);
    return this.auth.createSessionForUser(stored.userId);
  }

  list(userId: number) {
    return this.prisma.passkeyCredential.findMany({
      where: { userId },
      select: {
        id: true,
        label: true,
        deviceType: true,
        backedUp: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(userId: number, id: number) {
    const removed = await this.prisma.passkeyCredential.deleteMany({ where: { id, userId } });
    if (!removed.count) throw new NotFoundException('Passkey not found.');
  }
}
