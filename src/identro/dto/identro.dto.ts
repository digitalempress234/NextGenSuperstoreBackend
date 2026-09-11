// ─────────────────────────────────────────────────────────────────────────────
// Identro internal DTOs / interfaces
// Server-side only — never returned directly to API clients.
// Base path: /merchant-api
// ─────────────────────────────────────────────────────────────────────────────

// ── Standard Identro envelope ─────────────────────────────────────────────────

export interface IdentroResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
  [key: string]: unknown;
}

// ── Shared status strings ─────────────────────────────────────────────────────

/** Identro uses "COMPLETED" where QoreID uses "VERIFIED". Normalise internally to "VERIFIED". */
export type IdentroStatus = 'COMPLETED' | 'PENDING' | 'FAILED' | 'NOT_FOUND' | string;

// ── Liveness / SDK Session ────────────────────────────────────────────────────

/** Request body for POST /merchant-api/liveness/session */
export interface IdentroLivenessSessionRequest {
  /** Your internal transaction reference. */
  reference: string;
  /** Optional pseudonymous subject identifier — do NOT include PII. */
  subjectRef?: string;
  /** Token lifetime in seconds (server-capped by Identro). */
  ttlSeconds?: number;
}

export interface IdentroLivenessSessionResponse {
  sessionId: string;
  /** Short-lived token to hand to the mobile / web SDK — the only value forwarded to clients. */
  sdkToken: string;
  expiresAt: string;
}

// ── NIN ───────────────────────────────────────────────────────────────────────

/** Request body for POST /merchant-api/nin/verify */
export interface IdentroNinRequest {
  /** NIN number — field name is `nin` (not `idNumber`) as confirmed from live Identro API */
  nin: string;
  firstname?: string;
  lastname?: string;
  idempotencyKey?: string;
  consentCaptured?: boolean;
}

export interface IdentroNinData {
  reference?: string;
  status: IdentroStatus;
  firstname?: string;
  lastname?: string;
  [key: string]: unknown;
}

export type IdentroNinResponse = IdentroResponse<IdentroNinData>;

// ── Driver License ────────────────────────────────────────────────────────────

/** Request body for POST /merchant-api/driver-license/verify */
export interface IdentroDriversLicenseRequest {
  /** Field name is `licenseNumber` (not `idNumber`) — confirmed from live Identro API */
  licenseNumber: string;
  firstname?: string;
  lastname?: string;
  idempotencyKey?: string;
  consentCaptured?: boolean;
}

export interface IdentroDriversLicenseData {
  reference?: string;
  status: IdentroStatus;
  [key: string]: unknown;
}

export type IdentroDriversLicenseResponse = IdentroResponse<IdentroDriversLicenseData>;

// ── Voter's Card ──────────────────────────────────────────────────────────────

/** Request body for POST /merchant-api/voters-card/verify — field vin confirmed from live API */
export interface IdentroVotersCardRequest {
  vin: string;
  firstname?: string;
  lastname?: string;
  dob?: string;
  idempotencyKey?: string;
  consentCaptured?: boolean;
}

export interface IdentroVotersCardData {
  reference?: string;
  status: IdentroStatus;
  [key: string]: unknown;
}

export type IdentroVotersCardResponse = IdentroResponse<IdentroVotersCardData>;

// ── Face Verification ─────────────────────────────────────────────────────────

/** Request body for POST /merchant-api/face-verification */
export interface IdentroFaceVerifyRequest {
  idNumber: string;
  idType: 'NIN' | 'DRIVERS_LICENSE' | 'BVN' | string;
  photoBase64?: string;
  photoUrl?: string;
  idempotencyKey?: string;
  consentCaptured?: boolean;
}

export interface IdentroFaceVerifyData {
  reference?: string;
  status: IdentroStatus;
  faceMatchScore?: number;
  [key: string]: unknown;
}

export type IdentroFaceVerifyResponse = IdentroResponse<IdentroFaceVerifyData>;

// ── CAC Name Search ───────────────────────────────────────────────────────────

/** Request body for POST /merchant-api/cac/name-search */
export interface IdentroCacNameSearchRequest {
  q: string;
  exact?: boolean;
  idempotencyKey?: string;
}

export interface IdentroCacNameSearchMatch {
  companyName: string;
  registrationNumber: string;
  classification: string;
}

export interface IdentroCacNameSearchData {
  reference?: string;
  status: IdentroStatus;
  query?: string;
  exactMatchFound?: boolean;
  totalMatches?: number;
  matches?: IdentroCacNameSearchMatch[];
}

export type IdentroCacNameSearchResponse = IdentroResponse<IdentroCacNameSearchData>;

// ── CAC Basic ─────────────────────────────────────────────────────────────────

/**
 * Request body for POST /merchant-api/cac/basic
 * registrationNumber must include prefix: RC1684989, BN1234567, IT1234567
 */
export interface IdentroCacBasicRequest {
  serviceType: 'CAC_BASIC_VERIFICATION';
  registrationNumber: string;
  companyType?: IdentroCompanyType;
  consentCaptured?: boolean;
  idempotencyKey?: string;
}

export interface IdentroCacBasicData {
  reference?: string;
  status: IdentroStatus;
  companyName?: string;
  registrationNumber?: string;
  companyType?: string;
  registrationStatus?: string;
  [key: string]: unknown;
}

export type IdentroCacBasicResponse = IdentroResponse<IdentroCacBasicData>;

// ── CAC Advanced ──────────────────────────────────────────────────────────────

/** Request body for POST /merchant-api/cac/advance */
export interface IdentroCacAdvancedRequest {
  serviceType: 'CAC_ADVANCE_VERIFICATION';
  registrationNumber: string;
  companyType?: IdentroCompanyType;
  consentCaptured?: boolean;
  idempotencyKey?: string;
}

export type IdentroCacAdvancedResponse = IdentroResponse<Record<string, unknown>>;

// ── TIN ───────────────────────────────────────────────────────────────────────

/** Request body for POST /merchant-api/tin */
export interface IdentroTinRequest {
  regNumber?: string;
  tin?: string;
  idempotencyKey?: string;
  consentCaptured?: boolean;
}

export interface IdentroTinData {
  reference?: string;
  status: IdentroStatus;
  [key: string]: unknown;
}

export type IdentroTinResponse = IdentroResponse<IdentroTinData>;

// ── Company type enum ─────────────────────────────────────────────────────────

export type IdentroCompanyType =
  | 'BUSINESS_NAME'
  | 'COMPANY'
  | 'INCORPORATED_TRUSTEES'
  | 'LIMITED_PARTNERSHIP'
  | 'LIMITED_LIABILITY_PARTNERSHIP';

// ── Normalised CAC shape for DB persistence ───────────────────────────────────
// Mirrors the existing QoreID CacBasicExtracted so downstream upsert logic is unchanged.

export interface IdentroCacExtracted {
  identroReference: string | null;
  /** Normalised to "VERIFIED" when Identro data.status === "COMPLETED". */
  identroStatus: string | null;
  identroRaw: Record<string, unknown>;
  companyName: string | null;
  companyType: string | null;
  incorporatedAt: Date | null;
}

// ── Normalised identity shape ─────────────────────────────────────────────────
// Shared return type from verifyNin / verifyDriversLicense / verifyVotersCard.

export interface IdentroIdentityExtracted {
  identroReference: string | null;
  /** Normalised to "VERIFIED" when Identro data.status === "COMPLETED". */
  identroStatus: string | null;
  identroRaw: Record<string, unknown>;
  faceMatchScore?: number;
}
