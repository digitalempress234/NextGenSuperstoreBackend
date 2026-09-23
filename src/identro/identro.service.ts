import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  IdentroCacAdvancedRequest,
  IdentroCacAdvancedResponse,
  IdentroCacBasicResponse,
  IdentroCacExtracted,
  IdentroCacNameSearchRequest,
  IdentroCacNameSearchResponse,
  IdentroCompanyType,
  IdentroDriversLicenseResponse,
  IdentroFaceVerifyRequest,
  IdentroFaceVerifyResponse,
  IdentroIdentityExtracted,
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

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.getOrThrow<string>('IDENTRO_BASE_URL');
    this.apiKey = this.config.getOrThrow<string>('IDENTRO_API_KEY');
    this.apiKeyHeader = this.config.get<string>('IDENTRO_API_KEY_HEADER') ?? 'x-api-key';
    this.autoApproveOnMatch =
      this.config.get<string>('IDENTRO_AUTO_APPROVE_ON_MATCH') === 'true';
  }

  get shouldAutoApprove(): boolean {
    return this.autoApproveOnMatch;
  }

  async mintSdkSessionToken(
    dto: IdentroLivenessSessionRequest,
  ): Promise<IdentroLivenessSessionResponse> {
    return this.post<IdentroLivenessSessionResponse>(
      '/merchant-api/face/requests',
      dto,
    );
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
    opts: { firstname?: string; lastname?: string; idempotencyKey?: string } = {},
  ): Promise<IdentroIdentityExtracted> {
    const raw = await this.post<IdentroDriversLicenseResponse>('/merchant-api/driver-license/verify', {
      licenseNumber,
      consentCaptured: true,
      ...opts,
    });
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
        : { regNumber: regNumberOrTin, consentCaptured: true, ...(idempotencyKey && { idempotencyKey }) };

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
      throw new InternalServerErrorException(
        `Identro verification call failed (${response.status}).`,
      );
    }

    const json = (await response.json()) as { success?: boolean } & T;

    if (json.success === false) {
      this.logger.error(`Identro ${path} returned success=false: ${JSON.stringify(json)}`);
      throw new InternalServerErrorException('Identro verification returned a failure response.');
    }

    return json;
  }
}
