import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RedisService } from '../redis/redis.service';
import type {
  CacBasicExtracted,
  CacBasicRequest,
  DriversLicenseVerifyRequest,
  FaceVerifyRequest,
  MintSdkSessionRequest,
  MintSdkSessionResponse,
  NinVerifyRequest,
  PassportVerifyRequest,
  QoreIdIdentityResponse,
  QoreIdTokenResponse,
  VotersCardVerifyRequest,
} from './dto/qoreid.dto';

const TOKEN_CACHE_KEY = 'qoreid:bearer_token';

const TOKEN_TTL_BUFFER_SECONDS = 60;

const DEFAULT_TOKEN_TTL_SECONDS = 3600;

@Injectable()
export class QoreIDService {
  private readonly logger = new Logger(QoreIDService.name);
  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly autoApproveOnMatch: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.baseUrl = this.config.getOrThrow<string>('QOREID_BASE_URL');
    this.clientId = this.config.getOrThrow<string>('QOREID_CLIENT_ID');
    this.clientSecret = this.config.getOrThrow<string>('QOREID_CLIENT_SECRET');
    this.autoApproveOnMatch = this.config.get<string>('QOREID_AUTO_APPROVE_ON_MATCH') === 'true';
  }

  

  
  async getToken(): Promise<string> {
    const cached = await this.redis.get<string>(TOKEN_CACHE_KEY);
    if (cached) {
      return cached;
    }

    this.logger.log('QoreID token cache miss — fetching new token');

    const response = await fetch(`${this.baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: this.clientId,
        secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`QoreID /token failed: ${response.status} ${text}`);
      throw new InternalServerErrorException('Failed to authenticate with QoreID.');
    }

    const body = (await response.json()) as QoreIdTokenResponse;
    const ttl = (body.expiresIn ?? DEFAULT_TOKEN_TTL_SECONDS) - TOKEN_TTL_BUFFER_SECONDS;

    await this.redis.set(TOKEN_CACHE_KEY, body.accessToken, ttl);
    return body.accessToken;
  }

  
  get shouldAutoApprove(): boolean {
    return this.autoApproveOnMatch;
  }

  

  
  async mintSdkSessionToken(dto: MintSdkSessionRequest): Promise<MintSdkSessionResponse> {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(`${this.baseUrl}/v1/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`QoreID /v1/sessions failed: ${response.status} ${text}`);
      throw new InternalServerErrorException('Failed to mint QoreID SDK session token.');
    }

    return (await response.json()) as MintSdkSessionResponse;
  }

  

  
  async verifyNin(
    idNumber: string,
    data: Omit<NinVerifyRequest, 'idNumber'>,
  ): Promise<QoreIdIdentityResponse> {
    return this.post<QoreIdIdentityResponse>(
      `/v1/ng/identities/nin/${encodeURIComponent(idNumber)}`,
      data,
    );
  }

  
  async verifyDriversLicense(
    idNumber: string,
    data: Omit<DriversLicenseVerifyRequest, 'idNumber'>,
  ): Promise<QoreIdIdentityResponse> {
    return this.post<QoreIdIdentityResponse>(
      `/v1/ng/identities/drivers-license/${encodeURIComponent(idNumber)}`,
      data,
    );
  }

  
  async verifyVotersCard(
    vin: string,
    data: Omit<VotersCardVerifyRequest, 'vin'>,
  ): Promise<QoreIdIdentityResponse> {
    return this.post<QoreIdIdentityResponse>(
      `/v1/ng/identities/vin/${encodeURIComponent(vin)}`,
      data,
    );
  }

  
  async verifyPassport(
    passportNumber: string,
    data: Omit<PassportVerifyRequest, 'passportNumber'>,
  ): Promise<QoreIdIdentityResponse> {
    return this.post<QoreIdIdentityResponse>(
      `/v1/ng/identities/passport/${encodeURIComponent(passportNumber)}`,
      data,
    );
  }

  

  
  async verifyNinFace(dto: FaceVerifyRequest): Promise<QoreIdIdentityResponse> {
    return this.post<QoreIdIdentityResponse>('/v1/ng/identities/face-verification/nin', dto);
  }

  
  async verifyDriversLicenseFace(dto: FaceVerifyRequest): Promise<QoreIdIdentityResponse> {
    return this.post<QoreIdIdentityResponse>(
      '/v1/ng/identities/face-verification/drivers-license',
      dto,
    );
  }

  

  
  async verifyCac(regNumber: string): Promise<CacBasicExtracted> {
    const body: CacBasicRequest = { regNumber };
    const raw = await this.post<Record<string, unknown>>('/v1/ng/identities/cac-basic', body);

    
    const summary = raw['summary'] as Record<string, unknown> | undefined;
    const data = raw['data'] as Record<string, unknown> | undefined;

    return {
      qoreidReference: (raw['requestId'] as string | undefined) ?? null,
      qoreidStatus: (summary?.['status'] as string | undefined) ?? null,
      qoreidRaw: raw,
      companyName: (data?.['companyName'] as string | undefined) ?? null,
      companyType: (data?.['companyType'] as string | undefined) ?? null,
      incorporatedAt: data?.['registrationDate']
        ? new Date(data['registrationDate'] as string)
        : null,
    };
  }

  
  async verifyTin(regNumber: string): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>('/v2/ng/identities/tin/', { regNumber });
  }

  

  private async post<T>(path: string, body: unknown): Promise<T> {
    const token = await this.getToken();

    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`QoreID ${path} failed: ${response.status} ${text}`);
      throw new InternalServerErrorException(
        `QoreID verification call failed (${response.status}).`,
      );
    }

    return (await response.json()) as T;
  }
}
