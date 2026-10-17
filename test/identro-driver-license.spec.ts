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

  it('uses the secure three-stage liveness flow and trusts the provider decision', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            sessionId: 'LIVE-001',
            sdkToken: 'short-lived-token',
            expiresAt: '2026-10-03T12:30:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { accessKeyId: 'temporary' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            reference: 'LIVE-001',
            status: 'COMPLETED',
            liveness: { passed: true, score: 91.24, threshold: 80, decision: 'PASSED' },
          },
        }),
      });

    const session = await service.mintSdkSessionToken({
      serviceType: 'FACE_LIVENESS_ONLY',
      consentCaptured: true,
      consentReference: 'CONSENT-001',
    });
    await service.getLivenessCredentials(session.sessionId);
    const completionPayload = {
      submittedFaceBase64: 'data:image/jpeg;base64,captured-face',
      mobilePassiveFallback: true,
      metadata: { captureMode: 'passive' },
    };
    const result = await service.completeLivenessSession(session.sessionId, completionPayload);

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      'https://identro.example/merchant-api/face/liveness/sessions',
      'https://identro.example/merchant-api/face/liveness/sessions/LIVE-001/credentials',
      'https://identro.example/merchant-api/face/liveness/sessions/LIVE-001/complete',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      serviceType: 'FACE_LIVENESS_ONLY',
      sourceType: 'UPLOADED_REFERENCE',
      consentCaptured: true,
      consentReference: 'CONSENT-001',
    });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body as string)).toEqual(completionPayload);
    expect(result).toMatchObject({
      reference: 'LIVE-001',
      providerStatus: 'COMPLETED',
      passed: true,
      score: 91.24,
      threshold: 80,
      decision: 'PASSED',
    });
  });

  it('accepts reference-only session responses used by the three-stage SDK flow', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { reference: 'LIVE-REFERENCE-ONLY' },
      }),
    });

    await expect(
      service.mintSdkSessionToken({
        serviceType: 'FACE_LIVENESS_ONLY',
        consentCaptured: true,
        consentReference: 'CONSENT-002',
      }),
    ).resolves.toEqual({ sessionId: 'LIVE-REFERENCE-ONLY' });
  });
});
