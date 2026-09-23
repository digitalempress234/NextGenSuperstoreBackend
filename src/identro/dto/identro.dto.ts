export interface IdentroResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: unknown;
  [key: string]: unknown;
}

export type IdentroStatus = 'COMPLETED' | 'PENDING' | 'FAILED' | 'NOT_FOUND' | string;

export interface IdentroLivenessSessionRequest {
  serviceType?: string;
  sourceType?: string;
  nin?: string;
  consentReference?: string;
  reference?: string;
  subjectRef?: string;
  ttlSeconds?: number;
  idempotencyKey?: string;
}

export interface IdentroLivenessSessionResponse {
  sessionId: string;
  sdkToken: string;
  expiresAt: string;
}

export interface IdentroNinRequest {
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

export interface IdentroDriversLicenseRequest {
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

export interface IdentroFaceVerifyRequest {
  nin?: string;
  submittedFaceBase64?: string;
  selfieBase64?: string;
  idType?: 'NIN' | 'DRIVERS_LICENSE' | 'BVN' | string;
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

export interface IdentroCacAdvancedRequest {
  serviceType: 'CAC_ADVANCE_VERIFICATION';
  registrationNumber: string;
  companyType?: IdentroCompanyType;
  consentCaptured?: boolean;
  idempotencyKey?: string;
}

export type IdentroCacAdvancedResponse = IdentroResponse<Record<string, unknown>>;

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

export type IdentroCompanyType =
  | 'BUSINESS_NAME'
  | 'COMPANY'
  | 'INCORPORATED_TRUSTEES'
  | 'LIMITED_PARTNERSHIP'
  | 'LIMITED_LIABILITY_PARTNERSHIP';

export interface IdentroCacExtracted {
  identroReference: string | null;
  
  identroStatus: string | null;
  identroRaw: Record<string, unknown>;
  companyName: string | null;
  companyType: string | null;
  incorporatedAt: Date | null;
}

export interface IdentroIdentityExtracted {
  identroReference: string | null;
  
  identroStatus: string | null;
  identroRaw: Record<string, unknown>;
  faceMatchScore?: number;
}
