import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import type {
  IdentroCacAdvancedRequest,
  IdentroCacAdvancedResponse,
  IdentroCacBasicResponse,
  IdentroCacExtracted,
  IdentroCacNameSearchRequest,
  IdentroCacNameSearchResponse,
  IdentroCompanyType,
  IdentroDriversLicenseResponse,
  IdentroDriverLicenseRequestListResponse,
  IdentroFaceVerifyRequest,
  IdentroFaceVerifyResponse,
  IdentroIdentityExtracted,
  IdentroLivenessCompletionRequest,
  IdentroLivenessResult,
  IdentroLivenessSessionRequest,
  IdentroLivenessSessionResponse,
  IdentroNinResponse,
  IdentroTinResponse,
  IdentroVotersCardResponse,
} from './dto/identro.dto';

@Injectable()
export class IdentroService {
  private readonly logger = new Logger(IdentroService.name);

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiKeyHeader: string;
  private readonly autoApproveOnMatch: boolean;
  private readonly mockEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.mockEnabled = this.config.get<string>('IDENTRO_MOCK_ENABLED') === 'true';
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const productionAcknowledged =
      this.config.get<string>('IDENTRO_MOCK_ALLOW_PRODUCTION') === 'true';
    if (this.mockEnabled && isProduction && !productionAcknowledged) {
      throw new Error(
        'IDENTRO_MOCK_ENABLED cannot be used in production unless IDENTRO_MOCK_ALLOW_PRODUCTION=true is explicitly set.',
      );
    }
    this.baseUrl = this.config.get<string>('IDENTRO_BASE_URL') ?? 'https://api.identro.ng';
    this.apiKey = this.config.get<string>('IDENTRO_API_KEY') ?? '';
    if (!this.mockEnabled && !this.apiKey) throw new Error('IDENTRO_API_KEY is required.');
    this.apiKeyHeader = this.config.get<string>('IDENTRO_API_KEY_HEADER') ?? 'x-api-key';
    this.autoApproveOnMatch = this.config.get<string>('IDENTRO_AUTO_APPROVE_ON_MATCH') === 'true';
    if (this.mockEnabled)
      this.logger.warn('Identro mock mode is enabled; no provider calls will be made.');
  }

  get shouldAutoApprove(): boolean {
    return this.autoApproveOnMatch;
  }

  async mintSdkSessionToken(
    dto: IdentroLivenessSessionRequest,
  ): Promise<IdentroLivenessSessionResponse> {
    const request = {
      ...dto,
      ...(dto.serviceType === 'FACE_LIVENESS_ONLY' && !dto.sourceType
        ? { sourceType: 'UPLOADED_REFERENCE' }
        : {}),
    };
    const raw = await this.post<
      Partial<IdentroLivenessSessionResponse> & {
        reference?: string;
        sdkSessionToken?: string;
        token?: string;
        data?: Partial<IdentroLivenessSessionResponse> & {
          reference?: string;
          sdkSessionToken?: string;
          token?: string;
        };
      }
    >('/merchant-api/face/liveness/sessions', request);
    const data = raw.data ?? raw;
    const sessionId = data.sessionId ?? data.reference;
    const sdkToken = data.sdkToken ?? data.sdkSessionToken ?? data.token;
    const expiresAt = data.expiresAt;
    if (!sessionId) {
      this.logger.error('Identro liveness session response is missing its reference.');
      throw new InternalServerErrorException('Identro returned an invalid liveness session.');
    }
    return {
      sessionId,
      ...(sdkToken && { sdkToken }),
      ...(expiresAt && { expiresAt }),
    };
  }

  getLivenessCredentials(reference: string): Promise<Record<string, unknown>> {
    return this.post<Record<string, unknown>>(
      `/merchant-api/face/liveness/sessions/${encodeURIComponent(reference)}/credentials`,
      {},
    );
  }

  async completeLivenessSession(
    reference: string,
    payload: IdentroLivenessCompletionRequest = {},
  ): Promise<IdentroLivenessResult> {
    const raw = await this.post<Record<string, unknown>>(
      `/merchant-api/face/liveness/sessions/${encodeURIComponent(reference)}/complete`,
      payload,
    );
    const data = this.record(raw.data) ?? raw;
    const liveness = this.record(data.liveness);
    const providerStatus = this.string(data.status)?.toUpperCase() ?? null;
    const decision = this.string(liveness?.decision)?.toUpperCase() ?? null;
    const explicitPassed = this.boolean(liveness?.passed);
    const passed =
      explicitPassed ??
      (decision === 'PASSED' || decision === 'PASS'
        ? true
        : ['FAILED', 'FAIL', 'REJECTED', 'SPOOF', 'NOT_LIVE'].includes(decision ?? '')
          ? false
          : null);

    return {
      reference: this.string(data.reference) ?? reference,
      providerStatus,
      passed,
      score: this.number(liveness?.score),
      threshold: this.number(liveness?.threshold),
      decision,
      raw,
    };
  }

  async verifyNin(
    nin: string,
    opts: { firstname?: string; lastname?: string; idempotencyKey?: string } = {},
  ): Promise<IdentroIdentityExtracted> {
    const raw = await this.post<IdentroNinResponse>('/merchant-api/nin/verify', {
      nin,
      consentCaptured: true,
      ...opts,
    });
    return this.normaliseIdentity(raw);
  }

  async verifyDriversLicense(
    licenseNumber: string,
    opts: {
      firstname?: string;
      lastname?: string;
      idempotencyKey?: string;
      consentCaptured?: boolean;
    } = {},
  ): Promise<IdentroIdentityExtracted> {
    const raw = await this.post<IdentroDriversLicenseResponse>(
      '/merchant-api/driver-license/verify',
      {
        serviceType: 'DRIVER_LICENSE_VERIFICATION',
        licenseNumber,
        consentCaptured: opts.consentCaptured ?? true,
        ...opts,
      },
    );
    return this.normaliseIdentity(raw);
  }

  async createDriverLicenseRequest(
    licenseNumber: string,
    idempotencyKey: string,
  ): Promise<IdentroIdentityExtracted> {
    const raw = await this.post<IdentroDriversLicenseResponse>(
      '/merchant-api/driver-license/requests',
      {
        serviceType: 'DRIVER_LICENSE_VERIFICATION',
        licenseNumber,
        consentCaptured: true,
        idempotencyKey,
      },
    );
    return this.normaliseIdentity(raw);
  }

  listDriverLicenseRequests(): Promise<IdentroDriverLicenseRequestListResponse> {
    return this.get<IdentroDriverLicenseRequestListResponse>(
      '/merchant-api/driver-license/requests',
    );
  }

  async getDriverLicenseRequest(reference: string): Promise<IdentroIdentityExtracted> {
    const raw = await this.get<IdentroDriversLicenseResponse>(
      `/merchant-api/driver-license/requests/${encodeURIComponent(reference)}`,
    );
    return this.normaliseIdentity(raw);
  }

  async verifyVotersCard(
    vin: string,
    opts: { firstname?: string; lastname?: string; dob?: string; idempotencyKey?: string } = {},
  ): Promise<IdentroIdentityExtracted> {
    const raw = await this.post<IdentroVotersCardResponse>('/merchant-api/voters-card/verify', {
      vin,
      consentCaptured: true,
      ...opts,
    });
    return this.normaliseIdentity(raw);
  }

  async verifyFace(dto: IdentroFaceVerifyRequest): Promise<IdentroIdentityExtracted> {
    const raw = await this.post<IdentroFaceVerifyResponse>('/merchant-api/face/requests', {
      serviceType: 'FACE_MATCH_NIN',
      sourceType: 'NIN',
      nin: dto.nin,
      submittedFaceBase64: dto.submittedFaceBase64 ?? dto.selfieBase64,
      consentCaptured: true,
      ...(dto.idempotencyKey && { idempotencyKey: dto.idempotencyKey }),
    });
    const extracted = this.normaliseIdentity(raw);
    extracted.faceMatchScore = (raw.data as { faceMatchScore?: number } | undefined)
      ?.faceMatchScore;
    return extracted;
  }

  async cacNameSearch(dto: IdentroCacNameSearchRequest): Promise<IdentroCacNameSearchResponse> {
    return this.post<IdentroCacNameSearchResponse>('/merchant-api/cac/name-search', dto);
  }

  async verifyCac(
    registrationNumber: string,
    companyType: IdentroCompanyType = 'COMPANY',
    idempotencyKey?: string,
  ): Promise<IdentroCacExtracted> {
    const raw = await this.post<IdentroCacBasicResponse>('/merchant-api/cac/basic', {
      serviceType: 'CAC_BASIC_VERIFICATION',
      registrationNumber,
      companyType,
      consentCaptured: true,
      ...(idempotencyKey && { idempotencyKey }),
    });

    const data = raw.data;
    const rawStatus = data?.status ?? null;

    return {
      identroReference: data?.reference ?? null,
      identroStatus: this.normaliseStatus(rawStatus),
      identroRaw: raw as Record<string, unknown>,
      companyName: data?.companyName ?? null,
      companyType: data?.companyType ?? null,
      incorporatedAt: null,
    };
  }

  async verifyCacAdvanced(
    registrationNumber: string,
    companyType: IdentroCompanyType = 'COMPANY',
    idempotencyKey?: string,
  ): Promise<IdentroCacAdvancedResponse> {
    const body: IdentroCacAdvancedRequest = {
      serviceType: 'CAC_ADVANCE_VERIFICATION',
      registrationNumber,
      companyType,
      consentCaptured: true,
      ...(idempotencyKey && { idempotencyKey }),
    };
    return this.post<IdentroCacAdvancedResponse>('/merchant-api/cac/advance', body);
  }

  async verifyTin(
    regNumberOrTin: string,
    mode: 'regNumber' | 'tin' = 'regNumber',
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    const body =
      mode === 'tin'
        ? { tin: regNumberOrTin, consentCaptured: true, ...(idempotencyKey && { idempotencyKey }) }
        : {
            regNumber: regNumberOrTin,
            consentCaptured: true,
            ...(idempotencyKey && { idempotencyKey }),
          };

    return this.post<IdentroTinResponse>('/merchant-api/tin', body) as Promise<
      Record<string, unknown>
    >;
  }

  normaliseStatus(raw: string | null | undefined): string | null {
    if (!raw) return null;
    return raw === 'COMPLETED' ? 'VERIFIED' : raw;
  }

  private normaliseIdentity(raw: {
    data?: { reference?: string; status?: string; [key: string]: unknown };
    [key: string]: unknown;
  }): IdentroIdentityExtracted {
    const data = raw.data;
    return {
      identroReference: data?.reference ?? null,
      identroStatus: this.normaliseStatus(data?.status ?? null),
      identroRaw: raw as Record<string, unknown>,
    };
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (this.mockEnabled) return this.mockResponse(path, body) as T;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        [this.apiKeyHeader]: this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Identro ${path} failed: ${response.status} ${text}`);
      this.throwProviderError(response.status);
    }

    const json = (await response.json()) as { success?: boolean } & T;

    if (json.success === false) {
      this.logger.error(`Identro ${path} returned success=false: ${JSON.stringify(json)}`);
      throw new BadGatewayException('Identro verification returned a failure response.');
    }

    return json;
  }

  private async get<T>(path: string): Promise<T> {
    if (this.mockEnabled) return this.mockResponse(path) as T;
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        [this.apiKeyHeader]: this.apiKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`Identro ${path} failed: ${response.status} ${text}`);
      this.throwProviderError(response.status);
    }

    const json = (await response.json()) as { success?: boolean } & T;
    if (json.success === false) {
      this.logger.error(`Identro ${path} returned success=false: ${JSON.stringify(json)}`);
      throw new BadGatewayException('Identro verification returned a failure response.');
    }
    return json;
  }

  private record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private string(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private boolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private number(value: unknown): number | null {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private throwProviderError(status: number): never {
    if (status === 400 || status === 422) {
      throw new BadRequestException('Identro rejected the verification request payload.');
    }
    if (status === 429) {
      throw new ServiceUnavailableException('Identro rate limit reached. Please retry shortly.');
    }
    throw new BadGatewayException(`Identro verification service failed (${status}).`);
  }

  private mockResponse(path: string, body?: unknown): Record<string, unknown> {
    const reference = `MOCK-${randomUUID()}`;
    const request = this.record(body);
    if (path.endsWith('/face/liveness/sessions')) {
      return {
        success: true,
        data: {
          sessionId: reference,
          reference,
          sdkToken: `mock-sdk-${randomUUID()}`,
          expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
          mock: true,
        },
      };
    }
    if (path.includes('/face/liveness/sessions/') && path.endsWith('/credentials')) {
      return { success: true, data: { reference: this.referenceFromPath(path), mock: true } };
    }
    if (path.includes('/face/liveness/sessions/') && path.endsWith('/complete')) {
      return {
        success: true,
        data: {
          reference: this.referenceFromPath(path),
          status: 'COMPLETED',
          liveness: { passed: true, decision: 'PASSED', score: 1, threshold: 0.8 },
          mock: true,
        },
      };
    }
    if (path === '/merchant-api/driver-license/requests' && body === undefined) {
      return { success: true, data: [], mock: true };
    }
    if (path.includes('/merchant-api/driver-license/requests/') && body === undefined) {
      return {
        success: true,
        data: { reference: this.referenceFromPath(path), status: 'COMPLETED', mock: true },
      };
    }
    if (path.includes('/cac/name-search')) {
      return { success: true, data: { names: [], status: 'COMPLETED', mock: true } };
    }
    if (path.includes('/cac/basic')) {
      return {
        success: true,
        data: {
          reference,
          status: 'COMPLETED',
          companyName: 'Mock Verified Company',
          companyType: request?.companyType ?? 'COMPANY',
          mock: true,
        },
      };
    }
    if (path.includes('/cac/advance') || path.endsWith('/tin')) {
      return { success: true, data: { reference, status: 'COMPLETED', mock: true } };
    }
    if (path.includes('/face/requests')) {
      return {
        success: true,
        data: { reference, status: 'COMPLETED', faceMatchScore: 100, mock: true },
      };
    }
    return {
      success: true,
      data: {
        reference,
        status: 'COMPLETED',
        firstName: request?.firstname ?? 'Test',
        lastName: request?.lastname ?? 'User',
        mock: true,
      },
    };
  }

  private referenceFromPath(path: string): string {
    const parts = path.split('/').filter(Boolean);
    const tail = parts.at(-1);
    return decodeURIComponent(
      tail === 'complete' || tail === 'credentials' ? parts.at(-2)! : tail!,
    );
  }
}
