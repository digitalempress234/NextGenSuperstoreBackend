

export interface QoreIdTokenResponse {
  accessToken: string;
  
  expiresIn?: number;
}

export interface MintSdkSessionRequest {
  
  type?: 'collection' | 'workflow';
  
  productCode?: string;
  
  workflowId?: number;
  
  reference: string;
  
  subjectRef?: string;
  
  ttlSeconds?: number;
  
  maxAttempts?: number;
}

export interface MintSdkSessionResponse {
  sessionId: string;
  
  sdkSessionToken: string;
  type: 'collection' | 'workflow';
  productCode?: string;
  workflowId?: number;
  expiresAt: string;
}

export interface QoreIdApplicant {
  firstname: string;
  lastname: string;
  dob?: string;
  phone?: string;
  email?: string;
  gender?: string;
}

export interface NinVerifyRequest extends QoreIdApplicant {
  idNumber: string;
}

export interface DriversLicenseVerifyRequest extends QoreIdApplicant {
  idNumber: string;
}

export interface VotersCardVerifyRequest {
  firstname: string;
  lastname: string;
  dob: string;
  vin: string;
}

export interface PassportVerifyRequest {
  firstname: string;
  lastname: string;
  dob?: string;
  gender?: string;
  passportNumber: string;
}

export interface FaceVerifyRequest {
  idNumber: string;
  
  photoBase64?: string;
  photoUrl?: string;
}

export interface QoreIdStatus {
  
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
  
  faceMatchScore?: number;
  
  [key: string]: unknown;
}

export interface CacBasicRequest {
  
  regNumber: string;
}

export interface CacBasicExtracted {
  qoreidReference: string | null;
  qoreidStatus: string | null;
  qoreidRaw: Record<string, unknown>;
  companyName: string | null;
  companyType: string | null;
  incorporatedAt: Date | null;
}
