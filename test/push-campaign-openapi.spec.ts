import { Module, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { PushCampaignsController } from '../src/admin/push-campaigns.controller';
import { PushCampaignsService } from '../src/notifications/push-campaigns.service';
import { StorePushCampaignsController } from '../src/stores/store-push-campaigns.controller';
import { StaffJwtGuard } from '../src/staff/staff-jwt.guard';
import { StaffPermissionGuard } from '../src/staff/staff-permission.guard';

@Module({
  controllers: [PushCampaignsController, StorePushCampaignsController],
  providers: [{ provide: PushCampaignsService, useValue: {} }],
})
class PushCampaignDocsFixtureModule {}

describe('Admin push campaign OpenAPI contract', () => {
  it('documents the complete campaign workflow and sample request bodies', async () => {
    const fixture = await Test.createTestingModule({ imports: [PushCampaignDocsFixtureModule] })
      .overrideGuard(StaffJwtGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StaffPermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = fixture.createNestApplication();
    app.setGlobalPrefix('purse');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .addCookieAuth(
            'purse_staff_token',
            { type: 'apiKey', in: 'cookie', name: 'purse_staff_token' },
            'purse_staff_token',
          )
          .build(),
      );

      expect(document.paths).toHaveProperty('/purse/v1/admin/push-campaigns');
      expect(document.paths).toHaveProperty('/purse/v1/admin/push-campaigns/{id}');
      expect(document.paths).toHaveProperty('/purse/v1/admin/push-campaigns/{id}/test');
      expect(document.paths).toHaveProperty('/purse/v1/admin/push-campaigns/{id}/send');
      expect(document.paths).toHaveProperty('/purse/v1/admin/push-campaigns/{id}/schedule');
      expect(document.paths).toHaveProperty('/purse/v1/admin/push-campaigns/{id}/cancel');
      expect(document.paths).toHaveProperty('/purse/v1/admin/push-campaigns/{id}/review');
      expect(document.paths).toHaveProperty('/purse/v1/stores/{storeId}/push-campaigns');
      expect(document.paths).toHaveProperty(
        '/purse/v1/stores/{storeId}/push-campaigns/{campaignId}/test',
      );
      expect(document.paths).toHaveProperty(
        '/purse/v1/stores/{storeId}/push-campaigns/{campaignId}/send',
      );
      expect(document.paths).toHaveProperty(
        '/purse/v1/stores/{storeId}/push-campaigns/{campaignId}/schedule',
      );

      const createSchema = document.components?.schemas?.CreatePushCampaignDto;
      const audienceSchema = document.components?.schemas?.PushCampaignAudienceDto;
      expect(JSON.stringify(createSchema)).toContain('Weekend delivery offer');
      expect(JSON.stringify(audienceSchema)).toContain('SELECTED_USERS');
      expect(JSON.stringify(audienceSchema)).toContain('Ibadan');
      expect(JSON.stringify(audienceSchema)).not.toContain('STORE_CUSTOMERS');
      expect(JSON.stringify(document.components?.schemas?.ReviewPushCampaignDto)).toContain(
        'REJECT',
      );
      expect(JSON.stringify(document.components?.schemas?.CreateStorePushCampaignDto)).toContain(
        'Weekend delivery offer',
      );

      const operation = document.paths['/purse/v1/admin/push-campaigns']?.post;
      expect(operation?.security).toContainEqual({ purse_staff_token: [] });
      expect(JSON.stringify(operation)).toContain('notifications.send');
    } finally {
      await app.close();
    }
  });
});
