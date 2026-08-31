export interface RegionScopeContext {
  country: string;
  state: string;
  city?: string;
}

export interface AuthenticatedUser {
  id: number;
  email: string;
  roles: string[];
  permissions: string[];
  sessionId?: number;
  merchantScopeIds: number[];
  regionScopes: RegionScopeContext[];
}
