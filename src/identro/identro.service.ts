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

/**
 * Primary KYC / KYB provider.
 * All identity, business and biometric verification calls go through this service.
 * QoreIDService is retained in the codebase as a secondary / manual-fallback provider
 * but is not called from any live flow while this service is active.
 *
 * Base path: /merchant-api
 * Auth: x-api-key header (header name configurable via IDENTRO_API_KEY_HEADER)
 *
 * Status normalisation:
 *   Identro "COMPLETED" → internal "VERIFIED"
 *   Everything else    → returned as-is (e.g. "PENDING", "FAILED", "NOT_FOUND")
 */
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

  // ── Config getter ──────────────────────────────────────────────────────────

  /** Whether IDENTRO_AUTO_APPROVE_ON_MATCH is enabled. Consumed by RidersService / VendorsService. */
  get shouldAutoApprove(): boolean {
    return this.autoApproveOnMatch;
  }

  // ── Liveness / SDK Session ─────────────────────────────────────────────────

  /**
   * Mints a short-lived Identro liveness SDK session token.
   * Only the resulting sdkToken should ever be forwarded to the mobile/web client.
   * POST /merchant-api/liveness/session
   */
  async mintSdkSessionToken(
    dto: IdentroLivenessSessionRequest,
  ): Promise<IdentroLivenessSessionResponse> {
    const raw = await this.post<IdentroLivenessSessionResponse>(
      '/merchant-api/liveness/session',
      dto,
    );
    return raw;
  }

  // ── Identity Verification ──────────────────────────────────────────────────

  /**
   * Verify a NIN number via Identro.
   * POST /merchant-api/nin/verify
   * Field: nin (not idNumber — confirmed from live API)
   */
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

  /**
   * Verify a driver's license via Identro.
   * POST /merchant-api/driver-license/verify
   * Field: licenseNumber (confirmed from live API — not idNumber)
   */
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

  /**
   * Verify a voter's card (VIN) via Identro.
   * POST /merchant-api/voters-card/verify
   * Field: vin (confirmed from live API)
   */
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

  // ── Face Verification ──────────────────────────────────────────────────────

  /**
   * Face-match a selfie against a government ID record.
   * POST /merchant-api/face-verification
   */
  async verifyFace(dto: IdentroFaceVerifyRequest): Promise<IdentroIdentityExtracted> {
    const raw = await this.post<IdentroFaceVerifyResponse>('/merchant-api/face-verification', {
      ...dto,
      consentCaptured: true,
    });
    const extracted = this.normaliseIdentity(raw);
    extracted.faceMatchScore = (raw.data as { faceMatchScore?: number } | undefined)
      ?.faceMatchScore;
    return extracted;
  }

  // ── CAC Verification ───────────────────────────────────────────────────────

  /**
   * Search CAC business names before registration.
   * POST /merchant-api/cac/name-search
   */
  async cacNameSearch(dto: IdentroCacNameSearchRequest): Promise<IdentroCacNameSearchResponse> {
    return this.post<IdentroCacNameSearchResponse>('/merchant-api/cac/name-search', dto);
  }

  /**
   * CAC Basic verification — core company registration details.
   * POST /merchant-api/cac/basic
   * @param registrationNumber e.g. RC1684989, BN1234567, IT1234567
   */
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
      incorporatedAt: null, // Identro CAC Basic does not return incorporation date; use Advanced for this.
    };
  }

  /**
   * CAC Advanced verification — directors, shareholders, objectives etc.
   * POST /merchant-api/cac/advance
   */
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

  // ── TIN Verification ───────────────────────────────────────────────────────

  /**
   * Verify TIN by RC/BN/IT registration number or direct TIN.
   * POST /merchant-api/tin
   */
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

  // ── Status normalisation helpers ───────────────────────────────────────────

  /**
   * Normalises Identro's "COMPLETED" → internal "VERIFIED".
   * All other status strings are returned as-is.
   */
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

  // ── Internal HTTP helper ───────────────────────────────────────────────────

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
