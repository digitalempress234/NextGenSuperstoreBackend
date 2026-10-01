import type { ConfigService } from '@nestjs/config';

import { IdentroService } from '../src/identro/identro.service';

describe('Identro driver licence integration', () => {
  const fetchMock = jest.fn();
  let service: IdentroService;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as typeof fetch;
    const values: Record<string, string> = {
      IDENTRO_BASE_URL: 'https://identro.example',
      IDENTRO_API_KEY: 'secret',
      IDENTRO_API_KEY_HEADER: 'x-api-key',
      IDENTRO_AUTO_APPROVE_ON_MATCH: 'true',
    };
    const config = {
      getOrThrow: (key: string) => values[key],
      get: (key: string) => values[key],
    } as ConfigService;
    service = new IdentroService(config);
  });

  it('sends the documented direct verification payload', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { reference: 'DL-001', status: 'COMPLETED' },
      }),
    });

    const result = await service.verifyDriversLicense('AAA00000AA00', {
      consentCaptured: true,
      idempotencyKey: 'DL-VERIFY-001',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://identro.example/merchant-api/driver-license/verify',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          serviceType: 'DRIVER_LICENSE_VERIFICATION',
          licenseNumber: 'AAA00000AA00',
          consentCaptured: true,
          idempotencyKey: 'DL-VERIFY-001',
        }),
      }),
    );
    expect(result.identroStatus).toBe('VERIFIED');
    expect(result.identroReference).toBe('DL-001');
  });

  it('uses the tracked request and retrieval endpoints', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { reference: 'DL-002', status: 'PENDING' } }),
    });

    await service.createDriverLicenseRequest('AAA00000AA00', 'DL-REQUEST-002');
    await service.getDriverLicenseRequest('DL-002');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://identro.example/merchant-api/driver-license/requests',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://identro.example/merchant-api/driver-license/requests/DL-002',
    );
  });
});
