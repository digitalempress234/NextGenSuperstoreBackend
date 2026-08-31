// ─────────────────────────────────────────────────────────────────────────────
// QoreID internal DTOs / interfaces
// These are server-side only — never returned directly to API clients.
// ─────────────────────────────────────────────────────────────────────────────

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface QoreIdTokenResponse {
  accessToken: string;
  /** Expiry in seconds from the time of issuance (QoreID convention). */
  expiresIn?: number;
}

// ── SDK Session ───────────────────────────────────────────────────────────────

export interface MintSdkSessionRequest {
  /** "collection" (default) or "workflow". */
  type?: 'collection' | 'workflow';
  /** Required for collection sessions. e.g. "liveness". Mutually exclusive with workflowId. */
  productCode?: string;
  /** Required for workflow sessions. Mutually exclusive with productCode. */
  workflowId?: number;
  /** Your internal transaction reference. */
  reference: string;
  /** Optional pseudonymous subject identifier — do NOT include PII. */
  subjectRef?: string;
  /** Token lifetime in seconds (server-capped by QoreID). */
  ttlSeconds?: number;
  /** Max SDK redemption attempts (server-capped by QoreID). */
  maxAttempts?: number;
}

export interface MintSdkSessionResponse {
  sessionId: string;
  /** Short-lived JWT to hand to the mobile SDK — the only value forwarded to clients. */
  sdkSessionToken: string;
  type: 'collection' | 'workflow';
  productCode?: string;
  workflowId?: number;
  expiresAt: string;
}

// ── Shared identity check fields ───────────────────────────────────────────────

export interface QoreIdApplicant {
  firstname: string;
  lastname: string;
  dob?: string;
  phone?: string;
  email?: string;
  gender?: string;
}

// ── NIN ───────────────────────────────────────────────────────────────────────

export interface NinVerifyRequest extends QoreIdApplicant {
  idNumber: string;
}

// ── Driver's License ──────────────────────────────────────────────────────────

export interface DriversLicenseVerifyRequest extends QoreIdApplicant {
  idNumber: string;
}

// ── Voter's Card (VIN) ────────────────────────────────────────────────────────

export interface VotersCardVerifyRequest {
  firstname: string;
  lastname: string;
  dob: string;
  vin: string;
}

// ── Passport ──────────────────────────────────────────────────────────────────

export interface PassportVerifyRequest {
  firstname: string;
  lastname: string;
  dob?: string;
  gender?: string;
  passportNumber: string;
}

// ── Face Verification ─────────────────────────────────────────────────────────

export interface FaceVerifyRequest {
  idNumber: string;
  /** Base64-encoded selfie image. One of photoBase64 / photoUrl is required. */
  photoBase64?: string;
  photoUrl?: string;
}

// ── Generic QoreID identity response ─────────────────────────────────────────
// QoreID uses a consistent status object across all verification endpoints.

export interface QoreIdStatus {
  /** "VERIFIED" | "UNVERIFIED" | "PARTIAL" | "PENDING" etc. */
  status: string;
  subStatus?: string;
  state?: string;
}

export interface QoreIdIdentityResponse {
  applicant?: {
    firstname?: string;
    lastname?: string;
  };
  summary?: QoreIdStatus;
  /** Face-match confidence score 0-100, present on face-verification endpoints. */
  faceMatchScore?: number;
  /** Raw full response stored verbatim for the audit trail. */
  [key: string]: unknown;
}

// ── CAC Basic (Business / Company verification) ───────────────────────────────

/** Request body for POST /v1/ng/identities/cac-basic */
export interface CacBasicRequest {
  /** Company registration number, e.g. RC1234, BN1234, IT1234 */
  regNumber: string;
}

/** Shaped fields extracted from QoreID's CAC Basic response for storage. */
export interface CacBasicExtracted {
  qoreidReference: string | null;
  qoreidStatus: string | null;
  qoreidRaw: Record<string, unknown>;
  companyName: string | null;
  companyType: string | null;
  incorporatedAt: Date | null;
}
