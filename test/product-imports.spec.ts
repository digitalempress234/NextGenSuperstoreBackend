import { DiscountType } from '@prisma/client';
import { Module, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import ExcelJS from 'exceljs';

import { AdminProductImportsController } from '../src/product-imports/admin-product-imports.controller';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  calculateDiscount,
  parseCatalogueProductId,
  ProductImportsService,
} from '../src/product-imports/product-imports.service';
import { StoreProductImportsController } from '../src/product-imports/store-product-imports.controller';
import { StaffJwtGuard } from '../src/staff/staff-jwt.guard';
import { StaffPermissionGuard } from '../src/staff/staff-permission.guard';

@Module({
  controllers: [StoreProductImportsController, AdminProductImportsController],
  providers: [{ provide: ProductImportsService, useValue: {} }],
})
class ProductImportDocsFixtureModule {}

describe('ProductImportsService helpers', () => {
  describe('parseCatalogueProductId', () => {
    it('uses the calculated product id when Excel provides one', () => {
      expect(parseCatalogueProductId('12 - Rice', 44)).toBe(44);
    });

    it('falls back to the id prefix in the dropdown label', () => {
      expect(parseCatalogueProductId('12 - Rice - OhoO Farms')).toBe(12);
    });

    it('rejects a label without an id prefix', () => {
      expect(parseCatalogueProductId('Rice')).toBeUndefined();
    });
  });

  describe('calculateDiscount', () => {
    it('calculates a percentage discount', () => {
      expect(calculateDiscount(10_000, 'Percentage', 15)).toEqual({
        discountType: DiscountType.PERCENTAGE,
        discountValue: 15,
        discountPrice: 8_500,
      });
    });

    it('uses the supplied fixed selling price', () => {
      expect(calculateDiscount(10_000, 'Fixed Price', 8_750)).toEqual({
        discountType: DiscountType.FIXED,
        discountValue: 8_750,
        discountPrice: 8_750,
      });
    });

    it('rejects invalid discount values', () => {
      expect(() => calculateDiscount(10_000, 'Percentage', 101)).toThrow(
        'Percentage discount cannot exceed 100.',
      );
      expect(() => calculateDiscount(10_000, 'Fixed Price', 10_000)).toThrow(
        'Fixed discount price must be below regular price.',
      );
    });
  });
});

describe('ProductImportsService template', () => {
  it('generates the branded workbook with live catalogue and category dropdowns', async () => {
    const prisma = {
      store: {
        findUnique: jest.fn().mockResolvedValue({
          id: 6,
          storeName: 'Campus Hub Ibadan',
          isActive: true,
        }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 11,
            name: 'OhoO Rice',
            brand: 'OhoO Farms',
            barcode: '1234567890123',
            unit: '5 kg',
            category: { name: 'Groceries' },
          },
        ]),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([{ id: 3, name: 'Groceries' }]),
      },
    } as unknown as PrismaService;

    const service = new ProductImportsService(prisma);
    const template = await service.adminTemplate(6);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(template).buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Existing Products',
      'New Products',
      'Instructions',
      'Product Lookup',
      'Categories',
    ]);
    expect(workbook.getWorksheet('Product Lookup')?.getCell('A8').value).toBe(
      '11 - OhoO Rice - OhoO Farms',
    );
    expect(workbook.getWorksheet('Categories')?.getCell('C8').value).toBe('3 - Groceries');
    expect(workbook.getWorksheet('Existing Products')?.getCell('A10').dataValidation).toEqual(
      expect.objectContaining({ type: 'list', formulae: ['CatalogueProducts'] }),
    );
    expect(workbook.getWorksheet('New Products')?.getCell('C10').dataValidation).toEqual(
      expect.objectContaining({ type: 'list', formulae: ['ProductCategories'] }),
    );
  }, 30_000);
});

describe('Product import OpenAPI contract', () => {
  it('documents store and admin template, upload, commit, errors, and review routes', async () => {
    const fixture = await Test.createTestingModule({ imports: [ProductImportDocsFixtureModule] })
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
            'purse_access_token',
            { type: 'apiKey', in: 'cookie', name: 'purse_access_token' },
            'purse_access_token',
          )
          .addCookieAuth(
            'purse_staff_token',
            { type: 'apiKey', in: 'cookie', name: 'purse_staff_token' },
            'purse_staff_token',
          )
          .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'mobile_bearer')
          .build(),
      );

      const storeBase = '/purse/v1/stores/{storeId}/product-imports';
      const adminBase = '/purse/v1/admin/product-imports';
      expect(document.paths).toHaveProperty(`${storeBase}/template`);
      expect(document.paths).toHaveProperty(storeBase);
      expect(document.paths).toHaveProperty(`${storeBase}/{importId}`);
      expect(document.paths).toHaveProperty(`${storeBase}/{importId}/errors`);
      expect(document.paths).toHaveProperty(`${storeBase}/{importId}/commit`);
      expect(document.paths).toHaveProperty(`${adminBase}/template`);
      expect(document.paths).toHaveProperty(adminBase);
      expect(document.paths).toHaveProperty(`${adminBase}/{importId}`);
      expect(document.paths).toHaveProperty(`${adminBase}/{importId}/errors`);
      expect(document.paths).toHaveProperty(`${adminBase}/{importId}/commit`);
      expect(document.paths).toHaveProperty(`${adminBase}/{importId}/review`);

      const requestBodyContent = (path: string) =>
        (
          document.paths[path]?.post?.requestBody as
            { content?: Record<string, unknown> } | undefined
        )?.content;
      expect(requestBodyContent(storeBase)?.['multipart/form-data']).toBeDefined();
      expect(requestBodyContent(adminBase)?.['multipart/form-data']).toBeDefined();
      expect(JSON.stringify(document.components?.schemas?.ProductImportRowDecisionDto)).toContain(
        'APPROVE',
      );
      expect(document.paths[storeBase]?.post?.security).toEqual(
        expect.arrayContaining([{ purse_access_token: [] }, { mobile_bearer: [] }]),
      );
      expect(document.paths[adminBase]?.post?.security).toContainEqual({
        purse_staff_token: [],
      });
    } finally {
      await app.close();
    }
  });
});
