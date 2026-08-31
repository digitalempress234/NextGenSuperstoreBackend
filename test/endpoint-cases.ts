export type HttpMethod = 'get' | 'post' | 'patch' | 'delete';

export interface EndpointCase {
  module: string;
  method: HttpMethod;
  path: string;
  public?: boolean;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  expectedWithoutAuth: number | number[];
}

/**
 * Route inventory. Every controller endpoint must appear here.
 * The smoke suite compares this list with the generated OpenAPI document.
 */
export const endpointCases: EndpointCase[] = [
  { module: 'admin', method: 'get', path: '/admin/overview', expectedWithoutAuth: 401 },
  { module: 'admin', method: 'get', path: '/admin/riders/review', expectedWithoutAuth: 401 },
  { module: 'admin', method: 'patch', path: '/admin/riders/1/approve', expectedWithoutAuth: 401 },
  { module: 'admin', method: 'patch', path: '/admin/riders/1/reject', body: {}, expectedWithoutAuth: 401 },
  { module: 'admin', method: 'patch', path: '/admin/rider-documents/1/review', body: {}, expectedWithoutAuth: 401 },
  { module: 'admin', method: 'patch', path: '/admin/stores/1/activate', expectedWithoutAuth: 401 },
  { module: 'admin', method: 'patch', path: '/admin/vendors/1/approve', body: {}, expectedWithoutAuth: 401 },
  { module: 'admin', method: 'patch', path: '/admin/vendors/1/reject', body: {}, expectedWithoutAuth: 401 },

  { module: 'approvals', method: 'post', path: '/approvals', body: {}, expectedWithoutAuth: 401 },
  { module: 'approvals', method: 'get', path: '/approvals/pending', expectedWithoutAuth: 401 },
  { module: 'approvals', method: 'post', path: '/approvals/1/decision', body: {}, expectedWithoutAuth: 401 },

  { module: 'audit', method: 'get', path: '/audit/logs', expectedWithoutAuth: 401 },

  { module: 'auth', method: 'post', path: '/auth/register', public: true, body: {}, expectedWithoutAuth: 400 },
  { module: 'auth', method: 'post', path: '/auth/verify-email', public: true, body: {}, expectedWithoutAuth: 400 },
  { module: 'auth', method: 'post', path: '/auth/resend-email-otp', public: true, body: {}, expectedWithoutAuth: 400 },
  { module: 'auth', method: 'post', path: '/auth/google', public: true, body: {}, expectedWithoutAuth: 400 },
  { module: 'auth', method: 'post', path: '/auth/login', public: true, body: {}, expectedWithoutAuth: 400 },
  { module: 'auth', method: 'post', path: '/auth/forgot-password', public: true, body: {}, expectedWithoutAuth: 400 },
  { module: 'auth', method: 'post', path: '/auth/reset-password', public: true, body: {}, expectedWithoutAuth: 400 },
  { module: 'auth', method: 'post', path: '/auth/refresh', public: true, expectedWithoutAuth: 401 },
  { module: 'auth', method: 'post', path: '/auth/logout', expectedWithoutAuth: 401 },

  { module: 'cart', method: 'get', path: '/cart', expectedWithoutAuth: 401 },
  { module: 'cart', method: 'post', path: '/cart/items', body: {}, expectedWithoutAuth: 401 },
  { module: 'cart', method: 'patch', path: '/cart/items/1', body: {}, expectedWithoutAuth: 401 },
  { module: 'cart', method: 'delete', path: '/cart/items/1', expectedWithoutAuth: 401 },
  { module: 'cart', method: 'delete', path: '/cart/items', expectedWithoutAuth: 401 },

  { module: 'catalog', method: 'get', path: '/catalog/products', public: true, expectedWithoutAuth: 200 },
  { module: 'catalog', method: 'get', path: '/catalog/products/1', public: true, expectedWithoutAuth: [200, 404] },
  { module: 'catalog', method: 'get', path: '/catalog/categories', public: true, expectedWithoutAuth: 200 },
  { module: 'catalog', method: 'post', path: '/catalog/categories', body: {}, expectedWithoutAuth: 401 },
  { module: 'catalog', method: 'post', path: '/catalog/products', body: {}, expectedWithoutAuth: 401 },
  { module: 'catalog', method: 'patch', path: '/catalog/products/1', body: {}, expectedWithoutAuth: 401 },
  { module: 'catalog', method: 'delete', path: '/catalog/products/1', expectedWithoutAuth: 401 },

  { module: 'checkout', method: 'post', path: '/checkout', body: {}, expectedWithoutAuth: 401 },

  { module: 'delivery', method: 'get', path: '/deliveries/overview', expectedWithoutAuth: 401 },
  { module: 'delivery', method: 'get', path: '/deliveries/mine', expectedWithoutAuth: 401 },
  { module: 'delivery', method: 'get', path: '/deliveries/offers', expectedWithoutAuth: 401 },
  { module: 'delivery', method: 'post', path: '/deliveries/offers/1/accept', expectedWithoutAuth: 401 },
  { module: 'delivery', method: 'patch', path: '/deliveries/1/status', body: {}, expectedWithoutAuth: 401 },
  { module: 'delivery', method: 'post', path: '/deliveries/1/location', body: {}, expectedWithoutAuth: 401 },
  { module: 'delivery', method: 'get', path: '/deliveries/1/location', expectedWithoutAuth: 401 },
  { module: 'delivery', method: 'get', path: '/deliveries/1/locations', expectedWithoutAuth: 401 },

  { module: 'health', method: 'get', path: '/health', public: true, expectedWithoutAuth: 200 },

  { module: 'locations', method: 'get', path: '/locations/states', public: true, expectedWithoutAuth: 200 },
  { module: 'locations', method: 'get', path: '/locations/cities', public: true, query: { state: 'Lagos' }, expectedWithoutAuth: 200 },

  { module: 'notifications', method: 'get', path: '/notifications', expectedWithoutAuth: 401 },
  { module: 'notifications', method: 'get', path: '/notifications/unread-count', expectedWithoutAuth: 401 },
  { module: 'notifications', method: 'patch', path: '/notifications/1/read', expectedWithoutAuth: 401 },
  { module: 'notifications', method: 'patch', path: '/notifications/read-all', expectedWithoutAuth: 401 },
  { module: 'notifications', method: 'get', path: '/notifications/preferences', expectedWithoutAuth: 401 },
  { module: 'notifications', method: 'patch', path: '/notifications/preferences', body: {}, expectedWithoutAuth: 401 },

  { module: 'orders', method: 'get', path: '/orders', expectedWithoutAuth: 401 },
  { module: 'orders', method: 'get', path: '/orders/1', expectedWithoutAuth: 401 },
  { module: 'orders', method: 'patch', path: '/orders/1/status', body: {}, expectedWithoutAuth: 401 },

  { module: 'payments', method: 'post', path: '/payments/initialize', body: {}, expectedWithoutAuth: 401 },
  { module: 'payments', method: 'post', path: '/payments/paystack/webhook', public: true, body: {}, expectedWithoutAuth: 401 },

  { module: 'rbac', method: 'get', path: '/rbac/roles', expectedWithoutAuth: 401 },
  { module: 'rbac', method: 'get', path: '/rbac/permissions', expectedWithoutAuth: 401 },
  { module: 'rbac', method: 'post', path: '/rbac/roles/assign', body: {}, expectedWithoutAuth: 401 },
  { module: 'rbac', method: 'delete', path: '/rbac/roles/1/1', expectedWithoutAuth: 401 },
  { module: 'rbac', method: 'post', path: '/rbac/permission-overrides', body: {}, expectedWithoutAuth: 401 },

  { module: 'reviews', method: 'post', path: '/reviews', body: {}, expectedWithoutAuth: 401 },
  { module: 'reviews', method: 'get', path: '/reviews/product/1', public: true, expectedWithoutAuth: [200, 404] },

  { module: 'riders', method: 'get', path: '/riders/onboarding/requirements', expectedWithoutAuth: 401 },
  { module: 'riders', method: 'get', path: '/riders/banks', expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/bank-accounts/resolve', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'get', path: '/riders/me', expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/profile', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/documents', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/vehicles', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/bank-accounts', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/guarantors', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/submit', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/kyc/session', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/kyc/verify-document', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/kyc/verify-guarantor-document', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'get', path: '/riders/wallet', expectedWithoutAuth: 401 },
  { module: 'riders', method: 'get', path: '/riders/wallet/transactions', expectedWithoutAuth: 401 },
  { module: 'riders', method: 'post', path: '/riders/wallet/withdraw', body: {}, expectedWithoutAuth: 401 },
  { module: 'riders', method: 'get', path: '/riders/wallet/withdrawals', expectedWithoutAuth: 401 },

  { module: 'stores', method: 'get', path: '/stores', public: true, expectedWithoutAuth: 200 },
  { module: 'stores', method: 'get', path: '/stores/mine', expectedWithoutAuth: 401 },
  { module: 'stores', method: 'get', path: '/stores/1/overview', expectedWithoutAuth: 401 },
  { module: 'stores', method: 'post', path: '/stores', body: {}, expectedWithoutAuth: 401 },
  { module: 'stores', method: 'patch', path: '/stores/1', body: {}, expectedWithoutAuth: 401 },
  { module: 'stores', method: 'post', path: '/stores/1/products', body: {}, expectedWithoutAuth: 401 },
  { module: 'stores', method: 'post', path: '/stores/1/cac', body: {}, expectedWithoutAuth: 401 },
  { module: 'stores', method: 'get', path: '/stores/1/cac', expectedWithoutAuth: 401 },
  { module: 'stores', method: 'get', path: '/stores/1/wallet', expectedWithoutAuth: 401 },
  { module: 'stores', method: 'get', path: '/stores/1/wallet/transactions', expectedWithoutAuth: 401 },
  { module: 'stores', method: 'post', path: '/stores/1/wallet/withdraw', body: {}, expectedWithoutAuth: 401 },
  { module: 'stores', method: 'get', path: '/stores/1/wallet/withdrawals', expectedWithoutAuth: 401 },

  { module: 'uploads', method: 'post', path: '/uploads', body: {}, expectedWithoutAuth: 401 },

  { module: 'users', method: 'get', path: '/users/me', expectedWithoutAuth: 401 },
  { module: 'users', method: 'get', path: '/users/me/access', expectedWithoutAuth: 401 },
  { module: 'users', method: 'patch', path: '/users/me', body: {}, expectedWithoutAuth: 401 },

  { module: 'vendors', method: 'get', path: '/vendors/me', expectedWithoutAuth: 401 },
  { module: 'vendors', method: 'post', path: '/vendors/profile', body: {}, expectedWithoutAuth: 401 },
  
  { module: 'marketplace', method: 'get', path: '/marketplace/home', public: true, expectedWithoutAuth: 200 },
  { module: 'marketplace', method: 'get', path: '/marketplace/browse', public: true, expectedWithoutAuth: 200 },
  { module: 'marketplace', method: 'get', path: '/marketplace/products/1', public: true, expectedWithoutAuth: [200, 404] },
  { module: 'marketplace', method: 'get', path: '/marketplace/products/1/compare', public: true, expectedWithoutAuth: [200, 404] },
  { module: 'marketplace', method: 'get', path: '/marketplace/stores', public: true, expectedWithoutAuth: 200 },
  { module: 'marketplace', method: 'get', path: '/marketplace/stores/1', public: true, expectedWithoutAuth: [200, 404] },
  { module: 'marketplace', method: 'get', path: '/marketplace/wishlist', expectedWithoutAuth: 401 },
  { module: 'marketplace', method: 'post', path: '/marketplace/wishlist', body: {}, expectedWithoutAuth: 401 },
  { module: 'marketplace', method: 'delete', path: '/marketplace/wishlist/1', expectedWithoutAuth: 401 },
  { module: 'marketplace', method: 'get', path: '/marketplace/compare-list', expectedWithoutAuth: 401 },
  { module: 'marketplace', method: 'post', path: '/marketplace/compare-list', body: {}, expectedWithoutAuth: 401 },
  { module: 'marketplace', method: 'delete', path: '/marketplace/compare-list/1', expectedWithoutAuth: 401 },
];


