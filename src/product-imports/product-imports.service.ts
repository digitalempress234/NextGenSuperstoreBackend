import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DiscountType,
  Prisma,
  ProductImportRowStatus,
  ProductImportRowType,
  ProductImportStatus,
} from '@prisma/client';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaService } from '../prisma/prisma.service';
import {
  AdminProductImportQueryDto,
  ProductImportDecision,
  ProductImportQueryDto,
  ReviewProductImportDto,
} from './dto/product-import.dto';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const FIRST_DATA_ROW = 10;
const LAST_DATA_ROW = 1009;
const PAGE_LIMIT = 15;

const COLORS = {
  red: 'FF1B25',
  orange: 'FF7414',
  gold: 'FFB900',
  navy: '003B82',
  ink: '171414',
  cream: 'FFF8EE',
  paleGold: 'FFF3D6',
  paleGray: 'F0F1F3',
  paleRed: 'FDEBEC',
  white: 'FFFFFF',
};

const EXISTING_HEADERS = [
  'Catalogue Product*',
  'Product ID (Auto)',
  'Brand (Auto)',
  'Category (Auto)',
  'Unit / Size (Auto)',
  'Manufacturer Barcode (Auto)',
  'Regular Price (NGN)*',
  'Discount Type',
  'Discount Value',
  'Stock Quantity*',
  'Available for Sale',
  'Store SKU (Optional)',
  'Store Barcode (Optional)',
];

const NEW_HEADERS = [
  'Product Name*',
  'Brand',
  'Category*',
  'Unit Type',
  'Unit / Size',
  'Manufacturer Barcode',
  'Description',
  'Main Image URL',
  'Regular Price (NGN)*',
  'Discount Type',
  'Discount Value',
  'Stock Quantity*',
  'Available for Sale',
];

interface RowError {
  field: string;
  code: string;
  message: string;
  suggestion?: string;
}

interface ParsedRow {
  sheetName: string;
  rowNumber: number;
  rowType: ProductImportRowType;
  status: ProductImportRowStatus;
  matchedProductId?: number;
  productName?: string;
  brand?: string;
  categoryId?: number;
  unitType?: string;
  unit?: string;
  manufacturerBarcode?: string;
  description?: string;
  mainImageUrl?: string;
  price?: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountPrice?: number;
  stockQuantity?: number;
  availability?: boolean;
  storeSku?: string;
  storeBarcode?: string;
  errors: RowError[];
}

interface ImportActor {
  userId?: number;
  staffId?: number;
}

export function parseCatalogueProductId(label: string | undefined, formulaValue?: number) {
  if (Number.isInteger(formulaValue) && Number(formulaValue) > 0) return Number(formulaValue);
  const match = label?.match(/^\s*(\d+)\s*-/);
  return match ? Number(match[1]) : undefined;
}

export function calculateDiscount(
  price: number | undefined,
  typeValue: string | undefined,
  discountValue: number | undefined,
) {
  const normalized = typeValue?.trim().toLowerCase();
  if (!normalized || normalized === 'none') {
    return { discountType: undefined, discountValue: undefined, discountPrice: undefined };
  }
  if (!price || price <= 0 || !discountValue || discountValue <= 0) {
    throw new Error('A positive discount value is required.');
  }
  if (normalized === 'fixed price') {
    if (discountValue >= price)
      throw new Error('Fixed discount price must be below regular price.');
    return {
      discountType: DiscountType.FIXED,
      discountValue,
      discountPrice: roundMoney(discountValue),
    };
  }
  if (normalized === 'percentage') {
    if (discountValue > 100) throw new Error('Percentage discount cannot exceed 100.');
    return {
      discountType: DiscountType.PERCENTAGE,
      discountValue,
      discountPrice: roundMoney(price * (1 - discountValue / 100)),
    };
  }
  throw new Error('Discount type must be None, Fixed Price, or Percentage.');
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function textValue(value: ExcelJS.CellValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  const record = value as unknown as Record<string, unknown>;
  if ('result' in record) return textValue(record.result as ExcelJS.CellValue);
  if (typeof record.text === 'string') return record.text.trim() || undefined;
  if (Array.isArray(record.richText)) {
    const combined = record.richText
      .map((part) => (part as { text?: string }).text ?? '')
      .join('')
      .trim();
    return combined || undefined;
  }
  return undefined;
}

function numericValue(value: ExcelJS.CellValue): number | undefined {
  const raw = textValue(value)?.replace(/[₦,\s]/g, '');
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integerValue(value: ExcelJS.CellValue): number | undefined {
  const parsed = numericValue(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function optionalBoolean(value: ExcelJS.CellValue): boolean | undefined {
  const normalized = textValue(value)?.toLowerCase();
  if (!normalized) return undefined;
  if (['yes', 'true', '1'].includes(normalized)) return true;
  if (['no', 'false', '0'].includes(normalized)) return false;
  return undefined;
}

function normalizeBarcode(value: string | undefined) {
  return value?.replace(/\s+/g, '').trim().toUpperCase() || undefined;
}

function categoryIdFromSelection(value: string | undefined) {
  const match = value?.match(/^\s*(\d+)\s*-/);
  return match ? Number(match[1]) : undefined;
}

function productIdentityKey(
  name: string | null | undefined,
  brand: string | null | undefined,
  categoryId: number | null | undefined,
) {
  if (!name || !categoryId) return undefined;
  const normalizedName = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-NG');
  const normalizedBrand = (brand ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-NG');
  return `${categoryId}:${normalizedBrand}:${normalizedName}`;
}

@Injectable()
export class ProductImportsService {
  constructor(private readonly prisma: PrismaService) {}

  async vendorTemplate(userId: number, storeId: number) {
    const store = await this.assertVendorStore(userId, storeId, true);
    return this.buildTemplate(store.id, store.storeName);
  }

  async adminTemplate(storeId: number) {
    const store = await this.assertStore(storeId);
    return this.buildTemplate(store.id, store.storeName);
  }

  async vendorUpload(userId: number, storeId: number, file?: Express.Multer.File) {
    await this.assertVendorStore(userId, storeId, true);
    return this.stageUpload(storeId, file, { userId });
  }

  async adminUpload(staffId: number, storeId: number, file?: Express.Multer.File) {
    await this.assertStore(storeId);
    return this.stageUpload(storeId, file, { staffId });
  }

  async vendorList(userId: number, storeId: number, query: ProductImportQueryDto) {
    await this.assertVendorStore(userId, storeId, false);
    return this.list({ storeId, status: query.status }, query.page, query.limit);
  }

  async adminList(query: AdminProductImportQueryDto) {
    return this.list({ storeId: query.storeId, status: query.status }, query.page, query.limit);
  }

  async vendorOne(userId: number, storeId: number, importId: number) {
    await this.assertVendorStore(userId, storeId, false);
    return this.getJob(importId, { storeId });
  }

  adminOne(importId: number) {
    return this.getJob(importId);
  }

  async vendorCommit(userId: number, storeId: number, importId: number) {
    await this.assertVendorStore(userId, storeId, true);
    return this.commit(importId, { userId }, false, storeId);
  }

  async adminCommit(staffId: number, importId: number) {
    return this.commit(importId, { staffId }, true);
  }

  async vendorErrors(userId: number, storeId: number, importId: number) {
    await this.assertVendorStore(userId, storeId, false);
    const job = await this.getJobRecord(importId, { storeId });
    return this.buildErrorWorkbook(job.id, job.store.storeName);
  }

  async adminErrors(importId: number) {
    const job = await this.getJobRecord(importId);
    return this.buildErrorWorkbook(job.id, job.store.storeName);
  }

  async review(staffId: number, importId: number, dto: ReviewProductImportDto) {
    const job = await this.getJobRecord(importId);
    if (!job.committedAt)
      throw new ConflictException('The import must be committed before review.');
    const ids = dto.rows.map((decision) => decision.rowId);
    const rows = await this.prisma.productImportRow.findMany({
      where: { importId, id: { in: ids }, status: ProductImportRowStatus.PENDING_APPROVAL },
    });
    if (rows.length !== new Set(ids).size) {
      throw new BadRequestException(
        'Every row must belong to this import and be pending approval.',
      );
    }
    for (const decision of dto.rows) {
      if (decision.decision === ProductImportDecision.REJECT && !decision.reason?.trim()) {
        throw new BadRequestException(`A rejection reason is required for row ${decision.rowId}.`);
      }
    }

    const rowMap = new Map(rows.map((row) => [row.id, row]));
    await this.prisma.$transaction(
      async (tx) => {
        let approvedCreateCount = 0;
        let approvedUpdateCount = 0;
        for (const decision of dto.rows) {
          const row = rowMap.get(decision.rowId)!;
          if (decision.decision === ProductImportDecision.REJECT) {
            await tx.productImportRow.update({
              where: { id: row.id },
              data: {
                status: ProductImportRowStatus.REJECTED,
                reviewedByStaffId: staffId,
                reviewedAt: new Date(),
                rejectionReason: decision.reason!.trim(),
              },
            });
            continue;
          }
          const product = await this.createOrMatchProduct(tx, row);
          const existingOffer = await tx.storeProduct.findUnique({
            where: {
              storeId_productId: { storeId: job.storeId, productId: product.id },
            },
            select: { id: true },
          });
          const offer = await this.upsertOffer(tx, job.storeId, row, product.id);
          if (existingOffer) approvedUpdateCount += 1;
          else approvedCreateCount += 1;
          await tx.productImportRow.update({
            where: { id: row.id },
            data: {
              status: ProductImportRowStatus.IMPORTED,
              createdProductId: product.id,
              createdStoreProductId: offer.id,
              reviewedByStaffId: staffId,
              reviewedAt: new Date(),
              rejectionReason: null,
            },
          });
        }
        const pending = await tx.productImportRow.count({
          where: { importId, status: ProductImportRowStatus.PENDING_APPROVAL },
        });
        await tx.productImportJob.update({
          where: { id: importId },
          data: {
            pendingApprovalCount: pending,
            createCount: { increment: approvedCreateCount },
            updateCount: { increment: approvedUpdateCount },
          },
        });
        await tx.auditLog.create({
          data: {
            staffActorId: staffId,
            action: 'PRODUCT_IMPORT_REVIEWED',
            permission: 'products.bulk.import',
            entity: 'ProductImportJob',
            entityId: String(importId),
            changes: {
              decisions: dto.rows,
              approvedCreateCount,
              approvedUpdateCount,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      },
      { timeout: 60_000 },
    );
    return this.getJob(importId);
  }

  private async buildTemplate(storeId: number, storeName: string) {
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { status: true },
        select: { id: true, name: true, brand: true, barcode: true, unit: true, category: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.category.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
      }),
    ]);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'OhoO!';
    workbook.created = new Date();
    workbook.calcProperties.fullCalcOnLoad = true;
    const existing = workbook.addWorksheet('Existing Products', {
      views: [{ state: 'frozen', ySplit: 9, xSplit: 1, showGridLines: false }],
    });
    const newProducts = workbook.addWorksheet('New Products', {
      views: [{ state: 'frozen', ySplit: 9, xSplit: 1, showGridLines: false }],
    });
    const instructions = workbook.addWorksheet('Instructions', {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });
    const lookup = workbook.addWorksheet('Product Lookup', {
      views: [{ state: 'frozen', ySplit: 7, showGridLines: false }],
    });
    const categorySheet = workbook.addWorksheet('Categories', {
      views: [{ state: 'frozen', ySplit: 7, showGridLines: false }],
    });
    existing.properties.tabColor = { argb: COLORS.red };
    newProducts.properties.tabColor = { argb: COLORS.orange };
    instructions.properties.tabColor = { argb: COLORS.navy };
    lookup.properties.tabColor = { argb: COLORS.gold };
    categorySheet.properties.tabColor = { argb: COLORS.gold };

    const logoId = this.addLogo(workbook);
    this.prepareSheet(
      existing,
      logoId,
      'Add products already in the OhoO catalogue',
      `${storeName} · Store ID ${storeId}`,
      13,
    );
    this.prepareSheet(
      newProducts,
      logoId,
      'Submit products not yet in the OhoO catalogue',
      `${storeName} · New catalogue products require review`,
      13,
    );
    this.prepareSheet(
      instructions,
      logoId,
      'How to use the bulk product template',
      'Complete one or both product sheets, then upload this workbook.',
      4,
    );
    this.prepareSheet(
      lookup,
      logoId,
      'Catalogue product lookup',
      'This list was generated from the active OhoO catalogue.',
      7,
    );
    this.prepareSheet(
      categorySheet,
      logoId,
      'Category lookup',
      'This list was generated from active OhoO categories.',
      3,
    );

    lookup.getRow(7).values = [
      'Select this product',
      'Product ID',
      'Product Name',
      'Brand',
      'Category',
      'Unit / Size',
      'Manufacturer Barcode',
    ];
    this.styleHeader(lookup.getRow(7));
    products.forEach((product, index) => {
      lookup.getRow(8 + index).values = [
        `${product.id} - ${product.name}${product.brand ? ` - ${product.brand}` : ''}`,
        product.id,
        product.name,
        product.brand ?? '',
        product.category.name,
        product.unit ?? '',
        product.barcode ?? '',
      ];
    });
    lookup.columns = [
      { width: 48 },
      { width: 14 },
      { width: 34 },
      { width: 20 },
      { width: 25 },
      { width: 20 },
      { width: 25 },
    ];
    lookup.getColumn(7).numFmt = '@';
    categorySheet.getRow(7).values = ['Category ID', 'Category Name', 'Select this value'];
    this.styleHeader(categorySheet.getRow(7));
    categories.forEach((category, index) => {
      categorySheet.getRow(8 + index).values = [
        category.id,
        category.name,
        `${category.id} - ${category.name}`,
      ];
    });
    categorySheet.columns = [{ width: 16 }, { width: 30 }, { width: 38 }];

    const productLastRow = Math.max(8, 7 + products.length);
    const categoryLastRow = Math.max(8, 7 + categories.length);
    workbook.definedNames.add(`'Product Lookup'!$A$8:$A$${productLastRow}`, 'CatalogueProducts');
    workbook.definedNames.add(`Categories!$C$8:$C$${categoryLastRow}`, 'ProductCategories');

    this.setupUploadSheet(
      existing,
      EXISTING_HEADERS,
      [40, 16, 20, 24, 20, 26, 19, 18, 16, 17, 18, 22, 24],
    );
    this.setupUploadSheet(
      newProducts,
      NEW_HEADERS,
      [30, 20, 26, 17, 18, 24, 38, 34, 19, 18, 16, 17, 18],
    );
    for (let row = FIRST_DATA_ROW; row <= LAST_DATA_ROW; row += 1) {
      existing.getCell(row, 1).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['CatalogueProducts'],
      };
      existing.getCell(row, 2).value = {
        formula: `IFERROR(VLOOKUP(A${row},'Product Lookup'!$A$8:$G$${productLastRow},2,FALSE),"")`,
        result: '',
      };
      existing.getCell(row, 3).value = {
        formula: `IFERROR(VLOOKUP(A${row},'Product Lookup'!$A$8:$G$${productLastRow},4,FALSE),"")`,
        result: '',
      };
      existing.getCell(row, 4).value = {
        formula: `IFERROR(VLOOKUP(A${row},'Product Lookup'!$A$8:$G$${productLastRow},5,FALSE),"")`,
        result: '',
      };
      existing.getCell(row, 5).value = {
        formula: `IFERROR(VLOOKUP(A${row},'Product Lookup'!$A$8:$G$${productLastRow},6,FALSE),"")`,
        result: '',
      };
      existing.getCell(row, 6).value = {
        formula: `IFERROR(VLOOKUP(A${row},'Product Lookup'!$A$8:$G$${productLastRow},7,FALSE),"")`,
        result: '',
      };
      for (let col = 2; col <= 6; col += 1)
        existing.getCell(row, col).fill = this.fill(COLORS.paleGray);
      this.validation(existing, row, 8, ['None', 'Fixed Price', 'Percentage']);
      this.validation(existing, row, 11, ['Yes', 'No']);
      for (const col of [1, 7, 10]) existing.getCell(row, col).fill = this.fill(COLORS.paleGold);
      newProducts.getCell(row, 3).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['ProductCategories'],
      };
      this.validation(newProducts, row, 4, [
        'Piece',
        'Pack',
        'Bottle',
        'Bag',
        'Carton',
        'Kilogram',
        'Litre',
      ]);
      this.validation(newProducts, row, 10, ['None', 'Fixed Price', 'Percentage']);
      this.validation(newProducts, row, 13, ['Yes', 'No']);
      for (const col of [1, 3, 9, 12])
        newProducts.getCell(row, col).fill = this.fill(COLORS.paleGold);
    }
    this.addRequiredCellWarnings(existing, [1, 7, 10]);
    this.addRequiredCellWarnings(newProducts, [1, 3, 9, 12]);
    existing.getColumn(6).numFmt = '@';
    existing.getColumn(12).numFmt = '@';
    existing.getColumn(13).numFmt = '@';
    newProducts.getColumn(6).numFmt = '@';
    existing.getColumn(7).numFmt = '#,##0.00';
    newProducts.getColumn(9).numFmt = '#,##0.00';
    existing.autoFilter = `A9:M${LAST_DATA_ROW}`;
    newProducts.autoFilter = `A9:M${LAST_DATA_ROW}`;
    this.writeInstructions(instructions);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async stageUpload(
    storeId: number,
    file: Express.Multer.File | undefined,
    actor: ImportActor,
  ) {
    this.assertFile(file);
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.productImportJob.findFirst({
      where: {
        storeId,
        fileHash: hash,
        status: { notIn: [ProductImportStatus.FAILED, ProductImportStatus.CANCELLED] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (duplicate) return this.getJob(duplicate.id);
    const job = await this.prisma.productImportJob.create({
      data: {
        storeId,
        createdByUserId: actor.userId,
        createdByStaffId: actor.staffId,
        fileName: file.originalname.slice(0, 191),
        fileHash: hash,
        status: ProductImportStatus.VALIDATING,
      },
    });
    try {
      const rows = await this.parseWorkbook(file.buffer);
      const invalidRows = rows.filter((row) => row.errors.length > 0).length;
      await this.prisma.$transaction(async (tx) => {
        if (rows.length) {
          await tx.productImportRow.createMany({
            data: rows.map((row) => ({
              importId: job.id,
              ...row,
              errors: row.errors.length
                ? (row.errors as unknown as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            })),
          });
        }
        await tx.productImportJob.update({
          where: { id: job.id },
          data: {
            status: invalidRows ? ProductImportStatus.HAS_ERRORS : ProductImportStatus.READY,
            totalRows: rows.length,
            validRows: rows.length - invalidRows,
            invalidRows,
            existingProductRows: rows.filter((row) => row.rowType === ProductImportRowType.EXISTING)
              .length,
            newProductRows: rows.filter((row) => row.rowType === ProductImportRowType.NEW).length,
          },
        });
      });
      return this.getJob(job.id);
    } catch (error) {
      await this.prisma.productImportJob.update({
        where: { id: job.id },
        data: { status: ProductImportStatus.FAILED, errorMessage: this.errorMessage(error) },
      });
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        `The Excel workbook could not be processed: ${this.errorMessage(error)}`,
      );
    }
  }

  private async parseWorkbook(buffer: Buffer): Promise<ParsedRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
    const existingSheet = workbook.getWorksheet('Existing Products');
    const newSheet = workbook.getWorksheet('New Products');
    if (!existingSheet || !newSheet) {
      throw new BadRequestException(
        'Use the OhoO template without renaming or removing its product sheets.',
      );
    }
    this.assertHeaders(existingSheet, EXISTING_HEADERS);
    this.assertHeaders(newSheet, NEW_HEADERS);
    const [products, categories] = await Promise.all([
      this.prisma.product.findMany({
        where: { status: true },
        select: { id: true, barcode: true, name: true, brand: true, categoryId: true },
      }),
      this.prisma.category.findMany({ where: { isActive: true }, select: { id: true } }),
    ]);
    const productMap = new Map(products.map((product) => [product.id, product]));
    const productIdentityMap = new Map(
      products.map((product) => [
        productIdentityKey(product.name, product.brand ?? undefined, product.categoryId),
        product.id,
      ]),
    );
    const categoryIds = new Set(categories.map((category) => category.id));
    const rows: ParsedRow[] = [];
    const seenProducts = new Set<number>();
    const seenManufacturerBarcodes = new Set<string>();
    const seenStoreBarcodes = new Set<string>();
    const seenNewProductKeys = new Set<string>();

    for (let rowNumber = FIRST_DATA_ROW; rowNumber <= LAST_DATA_ROW; rowNumber += 1) {
      const row = existingSheet.getRow(rowNumber);
      if (!this.hasInput(row, [1, 7, 8, 9, 10, 11, 12, 13])) continue;
      const errors: RowError[] = [];
      const label = textValue(row.getCell(1).value);
      const productId = parseCatalogueProductId(label, integerValue(row.getCell(2).value));
      const price = numericValue(row.getCell(7).value);
      const stock = integerValue(row.getCell(10).value);
      if (!productId || !productMap.has(productId))
        errors.push(
          this.rowError(
            'Catalogue Product*',
            'PRODUCT_NOT_FOUND',
            'Select an active catalogue product.',
            'Use the dropdown in column A.',
          ),
        );
      if (productId && seenProducts.has(productId))
        errors.push(
          this.rowError(
            'Catalogue Product*',
            'DUPLICATE_PRODUCT',
            'The product appears more than once in this workbook.',
          ),
        );
      if (productId) seenProducts.add(productId);
      if (!price || price <= 0)
        errors.push(
          this.rowError(
            'Regular Price (NGN)*',
            'PRICE_REQUIRED',
            'Regular price must be greater than zero.',
          ),
        );
      if (stock === undefined || stock < 0)
        errors.push(
          this.rowError(
            'Stock Quantity*',
            'STOCK_INVALID',
            'Stock quantity must be a whole number of zero or more.',
          ),
        );
      const discount = this.discount(row.getCell(8).value, row.getCell(9).value, price, errors);
      const storeBarcode = normalizeBarcode(textValue(row.getCell(13).value));
      if (storeBarcode && seenStoreBarcodes.has(storeBarcode))
        errors.push(
          this.rowError(
            'Store Barcode (Optional)',
            'DUPLICATE_STORE_BARCODE',
            'The store barcode appears more than once in this workbook.',
          ),
        );
      if (storeBarcode) seenStoreBarcodes.add(storeBarcode);
      rows.push({
        sheetName: 'Existing Products',
        rowNumber,
        rowType: ProductImportRowType.EXISTING,
        status: errors.length ? ProductImportRowStatus.ERROR : ProductImportRowStatus.VALID,
        matchedProductId: productId,
        price,
        ...discount,
        stockQuantity: stock,
        availability: optionalBoolean(row.getCell(11).value) ?? (stock !== undefined && stock > 0),
        storeSku: textValue(row.getCell(12).value),
        storeBarcode,
        errors,
      });
    }

    for (let rowNumber = FIRST_DATA_ROW; rowNumber <= LAST_DATA_ROW; rowNumber += 1) {
      const row = newSheet.getRow(rowNumber);
      if (!this.hasInput(row, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])) continue;
      const errors: RowError[] = [];
      const productName = textValue(row.getCell(1).value);
      const brand = textValue(row.getCell(2).value);
      const categoryId = categoryIdFromSelection(textValue(row.getCell(3).value));
      const productKey = productIdentityKey(productName, brand, categoryId);
      const manufacturerBarcode = normalizeBarcode(textValue(row.getCell(6).value));
      const price = numericValue(row.getCell(9).value);
      const stock = integerValue(row.getCell(12).value);
      const imageUrl = textValue(row.getCell(8).value);
      if (!productName)
        errors.push(
          this.rowError('Product Name*', 'PRODUCT_NAME_REQUIRED', 'Product name is required.'),
        );
      if (!categoryId || !categoryIds.has(categoryId))
        errors.push(
          this.rowError(
            'Category*',
            'CATEGORY_INVALID',
            'Select an active category from the dropdown.',
          ),
        );
      if (!price || price <= 0)
        errors.push(
          this.rowError(
            'Regular Price (NGN)*',
            'PRICE_REQUIRED',
            'Regular price must be greater than zero.',
          ),
        );
      if (stock === undefined || stock < 0)
        errors.push(
          this.rowError(
            'Stock Quantity*',
            'STOCK_INVALID',
            'Stock quantity must be a whole number of zero or more.',
          ),
        );
      if (imageUrl && !this.isHttpUrl(imageUrl))
        errors.push(
          this.rowError(
            'Main Image URL',
            'IMAGE_URL_INVALID',
            'Image URL must be a public HTTP or HTTPS URL.',
          ),
        );
      if (manufacturerBarcode && seenManufacturerBarcodes.has(manufacturerBarcode))
        errors.push(
          this.rowError(
            'Manufacturer Barcode',
            'DUPLICATE_MANUFACTURER_BARCODE',
            'The manufacturer barcode appears more than once in this workbook.',
          ),
        );
      if (manufacturerBarcode) seenManufacturerBarcodes.add(manufacturerBarcode);
      if (productKey && seenNewProductKeys.has(productKey))
        errors.push(
          this.rowError(
            'Product Name*',
            'DUPLICATE_NEW_PRODUCT',
            'The same new product appears more than once in this workbook.',
          ),
        );
      if (productKey) seenNewProductKeys.add(productKey);
      const discount = this.discount(row.getCell(10).value, row.getCell(11).value, price, errors);
      rows.push({
        sheetName: 'New Products',
        rowNumber,
        rowType: ProductImportRowType.NEW,
        status: errors.length ? ProductImportRowStatus.ERROR : ProductImportRowStatus.VALID,
        productName,
        brand,
        categoryId,
        unitType: textValue(row.getCell(4).value),
        unit: textValue(row.getCell(5).value),
        manufacturerBarcode,
        description: textValue(row.getCell(7).value),
        mainImageUrl: imageUrl,
        price,
        ...discount,
        stockQuantity: stock,
        availability: optionalBoolean(row.getCell(13).value) ?? (stock !== undefined && stock > 0),
        errors,
      });
    }
    if (!rows.length)
      throw new BadRequestException('The workbook does not contain any product rows.');

    const manufacturerBarcodes = rows
      .map((row) => row.manufacturerBarcode)
      .filter((value): value is string => Boolean(value));
    const storeBarcodes = rows
      .map((row) => row.storeBarcode)
      .filter((value): value is string => Boolean(value));
    const [catalogueConflicts, storeBarcodeConflicts] = await Promise.all([
      manufacturerBarcodes.length
        ? this.prisma.product.findMany({
            where: { barcode: { in: manufacturerBarcodes } },
            select: { id: true, barcode: true },
          })
        : [],
      storeBarcodes.length
        ? this.prisma.storeProduct.findMany({
            where: { barcode: { in: storeBarcodes } },
            select: { barcode: true },
          })
        : [],
    ]);
    const catalogueBarcodeMap = new Map(catalogueConflicts.map((item) => [item.barcode, item.id]));
    const conflictingStoreBarcodes = new Set(storeBarcodeConflicts.map((item) => item.barcode));
    for (const row of rows) {
      if (
        row.rowType === ProductImportRowType.NEW &&
        row.manufacturerBarcode &&
        catalogueBarcodeMap.has(row.manufacturerBarcode)
      ) {
        row.errors.push(
          this.rowError(
            'Manufacturer Barcode',
            'PRODUCT_ALREADY_EXISTS',
            'This barcode already belongs to an OhoO catalogue product.',
            'Use the Existing Products sheet.',
          ),
        );
      }
      const productKey = productIdentityKey(row.productName, row.brand, row.categoryId);
      if (
        row.rowType === ProductImportRowType.NEW &&
        productKey &&
        productIdentityMap.has(productKey)
      ) {
        row.errors.push(
          this.rowError(
            'Product Name*',
            'PRODUCT_ALREADY_EXISTS',
            'A matching product already exists in the OhoO catalogue.',
            'Use the Existing Products sheet.',
          ),
        );
      }
      if (row.storeBarcode && conflictingStoreBarcodes.has(row.storeBarcode)) {
        row.errors.push(
          this.rowError(
            'Store Barcode (Optional)',
            'STORE_BARCODE_IN_USE',
            'This store barcode is already in use.',
          ),
        );
      }
      row.status = row.errors.length ? ProductImportRowStatus.ERROR : ProductImportRowStatus.VALID;
    }
    return rows;
  }

  private async commit(
    importId: number,
    actor: ImportActor,
    approveNewProducts: boolean,
    storeId?: number,
  ) {
    const job = await this.getJobRecord(importId, storeId ? { storeId } : undefined);
    if (job.status === ProductImportStatus.COMPLETED) return this.getJob(importId);
    if (job.status !== ProductImportStatus.READY || job.invalidRows > 0) {
      throw new ConflictException('Only a validated import without errors can be committed.');
    }
    const claimed = await this.prisma.productImportJob.updateMany({
      where: { id: importId, status: ProductImportStatus.READY },
      data: { status: ProductImportStatus.COMMITTING },
    });
    if (!claimed.count) throw new ConflictException('The import is already being processed.');
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.productImportRow.findMany({
            where: { importId, status: ProductImportRowStatus.VALID },
            orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
          });
          let createCount = 0;
          let updateCount = 0;
          let pendingApprovalCount = 0;
          for (const row of rows) {
            if (row.rowType === ProductImportRowType.NEW && !approveNewProducts) {
              await tx.productImportRow.update({
                where: { id: row.id },
                data: { status: ProductImportRowStatus.PENDING_APPROVAL },
              });
              pendingApprovalCount += 1;
              continue;
            }
            const product =
              row.rowType === ProductImportRowType.EXISTING
                ? await tx.product.findUnique({ where: { id: row.matchedProductId ?? -1 } })
                : await this.createOrMatchProduct(tx, row);
            if (!product)
              throw new BadRequestException(
                `Product for ${row.sheetName} row ${row.rowNumber} no longer exists.`,
              );
            const existingOffer = await tx.storeProduct.findUnique({
              where: { storeId_productId: { storeId: job.storeId, productId: product.id } },
            });
            const offer = await this.upsertOffer(tx, job.storeId, row, product.id);
            if (existingOffer) updateCount += 1;
            else createCount += 1;
            await tx.productImportRow.update({
              where: { id: row.id },
              data: {
                status: ProductImportRowStatus.IMPORTED,
                createdProductId: product.id,
                createdStoreProductId: offer.id,
              },
            });
          }
          await tx.productImportJob.update({
            where: { id: importId },
            data: {
              status: ProductImportStatus.COMPLETED,
              createCount,
              updateCount,
              pendingApprovalCount,
              committedAt: new Date(),
              errorMessage: null,
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: actor.userId,
              staffActorId: actor.staffId,
              action: 'PRODUCT_IMPORT_COMMITTED',
              permission: 'products.bulk.import',
              entity: 'ProductImportJob',
              entityId: String(importId),
              changes: { storeId: job.storeId, createCount, updateCount, pendingApprovalCount },
            },
          });
        },
        { timeout: 60_000 },
      );
    } catch (error) {
      await this.prisma.productImportJob.update({
        where: { id: importId },
        data: { status: ProductImportStatus.FAILED, errorMessage: this.errorMessage(error) },
      });
      throw error;
    }
    return this.getJob(importId);
  }

  private async createOrMatchProduct(
    tx: Prisma.TransactionClient,
    row: {
      productName: string | null;
      brand: string | null;
      categoryId: number | null;
      unit: string | null;
      manufacturerBarcode: string | null;
      description: string | null;
      mainImageUrl: string | null;
    },
  ) {
    if (row.manufacturerBarcode) {
      const matched = await tx.product.findUnique({ where: { barcode: row.manufacturerBarcode } });
      if (matched) return matched;
    }
    if (!row.productName || !row.categoryId)
      throw new BadRequestException('New product data is incomplete.');
    const matchedByIdentity = await tx.product.findFirst({
      where: {
        name: row.productName,
        brand: row.brand,
        categoryId: row.categoryId,
      },
    });
    if (matchedByIdentity) return matchedByIdentity;
    const product = await tx.product.create({
      data: {
        name: row.productName,
        brand: row.brand,
        categoryId: row.categoryId,
        unit: row.unit,
        barcode: row.manufacturerBarcode,
        description: row.description,
        status: true,
      },
    });
    if (row.mainImageUrl)
      await tx.productImage.create({
        data: { productId: product.id, url: row.mainImageUrl, sortOrder: 0 },
      });
    return product;
  }

  private upsertOffer(
    tx: Prisma.TransactionClient,
    storeId: number,
    row: {
      price: Prisma.Decimal | null;
      discountPrice: Prisma.Decimal | null;
      discountType: DiscountType | null;
      stockQuantity: number | null;
      availability: boolean | null;
      storeSku: string | null;
      storeBarcode: string | null;
    },
    productId: number,
  ) {
    if (!row.price || row.stockQuantity === null)
      throw new BadRequestException('Store offer data is incomplete.');
    const barcode = row.storeBarcode || `OHO-${storeId}-${productId}`;
    return tx.storeProduct.upsert({
      where: { storeId_productId: { storeId, productId } },
      create: {
        storeId,
        productId,
        sku: row.storeSku || `OHO-${storeId}-${productId}`,
        barcode,
        barcodeFormat: 'CODE_128',
        price: row.price,
        discountPrice: row.discountPrice,
        discountType: row.discountType,
        stockQuantity: row.stockQuantity,
        availability: row.availability ?? row.stockQuantity > 0,
        isActive: true,
      },
      update: {
        sku: row.storeSku || undefined,
        barcode,
        barcodeFormat: 'CODE_128',
        price: row.price,
        discountPrice: row.discountPrice,
        discountType: row.discountType,
        stockQuantity: row.stockQuantity,
        availability: row.availability ?? row.stockQuantity > 0,
        isActive: true,
      },
    });
  }

  private async list(where: Prisma.ProductImportJobWhereInput, page = 1, limit = PAGE_LIMIT) {
    limit = Math.min(PAGE_LIMIT, Math.max(1, limit));
    page = Math.max(1, page);
    const [items, total] = await Promise.all([
      this.prisma.productImportJob.findMany({
        where,
        include: { store: { select: { id: true, storeName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.productImportJob.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  private async getJob(importId: number, where: Prisma.ProductImportJobWhereInput = {}) {
    const job = await this.getJobRecord(importId, where);
    const errorRows = await this.prisma.productImportRow.findMany({
      where: { importId, status: ProductImportRowStatus.ERROR },
      select: { id: true, sheetName: true, rowNumber: true, errors: true },
      orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
      take: 100,
    });
    return { ...job, errors: errorRows, errorsTruncated: job.invalidRows > errorRows.length };
  }

  private async getJobRecord(importId: number, where: Prisma.ProductImportJobWhereInput = {}) {
    const job = await this.prisma.productImportJob.findFirst({
      where: { id: importId, ...where },
      include: { store: { select: { id: true, storeName: true, isActive: true } } },
    });
    if (!job) throw new NotFoundException('Product import not found.');
    return job;
  }

  private async buildErrorWorkbook(importId: number, storeName: string) {
    const rows = await this.prisma.productImportRow.findMany({
      where: { importId, status: ProductImportRowStatus.ERROR },
      orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
    });
    if (!rows.length) throw new NotFoundException('This import has no row errors.');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Import Errors', {
      views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    });
    sheet.getCell('A1').value = `OhoO product import errors · ${storeName}`;
    sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: COLORS.ink } };
    sheet.getRow(3).values = [
      'Sheet',
      'Excel Row',
      'Field',
      'Code',
      'Problem',
      'Suggested Correction',
    ];
    this.styleHeader(sheet.getRow(3));
    for (const row of rows) {
      const errors = Array.isArray(row.errors) ? (row.errors as unknown as RowError[]) : [];
      for (const error of errors)
        sheet.addRow([
          row.sheetName,
          row.rowNumber,
          error.field,
          error.code,
          error.message,
          error.suggestion ?? '',
        ]);
    }
    sheet.columns = [
      { width: 22 },
      { width: 12 },
      { width: 28 },
      { width: 30 },
      { width: 50 },
      { width: 50 },
    ];
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async assertVendorStore(userId: number, storeId: number, requireActive: boolean) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
      select: { id: true, storeName: true, isActive: true },
    });
    if (!store) throw new ForbiddenException('You do not have access to this store.');
    if (requireActive && !store.isActive)
      throw new ForbiddenException(
        'The store must be approved and active before products can be imported.',
      );
    return store;
  }

  private async assertStore(storeId: number) {
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, storeName: true, isActive: true },
    });
    if (!store) throw new NotFoundException('Store not found.');
    return store;
  }

  private assertFile(file?: Express.Multer.File): asserts file is Express.Multer.File {
    if (!file) throw new BadRequestException('An Excel workbook is required in the file field.');
    if (!file.originalname.toLowerCase().endsWith('.xlsx'))
      throw new BadRequestException('Only .xlsx Excel workbooks are supported.');
    if (!file.size || file.size > MAX_FILE_BYTES)
      throw new BadRequestException('The Excel workbook must not exceed 5 MB.');
    if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b)
      throw new BadRequestException('The uploaded file is not a valid .xlsx workbook.');
  }

  private assertHeaders(sheet: ExcelJS.Worksheet, expected: string[]) {
    const actual = expected.map((_, index) => textValue(sheet.getCell(9, index + 1).value) ?? '');
    if (actual.some((value, index) => value !== expected[index]))
      throw new BadRequestException(
        `The ${sheet.name} headers were changed. Download a fresh OhoO template.`,
      );
  }

  private hasInput(row: ExcelJS.Row, columns: number[]) {
    return columns.some((column) => Boolean(textValue(row.getCell(column).value)));
  }

  private discount(
    typeCell: ExcelJS.CellValue,
    valueCell: ExcelJS.CellValue,
    price: number | undefined,
    errors: RowError[],
  ) {
    try {
      return calculateDiscount(price, textValue(typeCell), numericValue(valueCell));
    } catch (error) {
      errors.push(this.rowError('Discount Value', 'DISCOUNT_INVALID', this.errorMessage(error)));
      return { discountType: undefined, discountValue: undefined, discountPrice: undefined };
    }
  }

  private rowError(field: string, code: string, message: string, suggestion?: string): RowError {
    return { field, code, message, suggestion };
  }

  private isHttpUrl(value: string) {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  private addLogo(workbook: ExcelJS.Workbook) {
    const logoPath = join(__dirname, '..', 'branding', 'assets', 'ohoo-logo.png');
    return existsSync(logoPath)
      ? workbook.addImage({ filename: logoPath, extension: 'png' })
      : undefined;
  }

  private prepareSheet(
    sheet: ExcelJS.Worksheet,
    logoId: number | undefined,
    title: string,
    subtitle: string,
    columns: number,
  ) {
    if (logoId !== undefined)
      sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 170, height: 66 } });
    sheet.getCell('C2').value = title;
    sheet.getCell('C2').font = { bold: true, size: 16, color: { argb: COLORS.ink } };
    sheet.getCell('C3').value = subtitle;
    sheet.getCell('C3').font = { italic: true, size: 10, color: { argb: '6B625F' } };
    const third = Math.max(1, Math.floor(columns / 3));
    for (let col = 1; col <= columns; col += 1)
      sheet.getCell(5, col).fill = this.fill(
        col <= third ? COLORS.red : col <= third * 2 ? COLORS.orange : COLORS.gold,
      );
    sheet.getRow(5).height = 4;
  }

  private setupUploadSheet(sheet: ExcelJS.Worksheet, headers: string[], widths: number[]) {
    sheet.getCell('A7').value = 'Yellow = required input';
    sheet.getCell('C7').value = 'White = optional input';
    sheet.getCell('E7').value = 'Grey = filled automatically';
    sheet.getCell('G7').value = 'Red = missing or invalid';
    sheet.getCell('A7').fill = this.fill(COLORS.paleGold);
    sheet.getCell('E7').fill = this.fill(COLORS.paleGray);
    sheet.getCell('G7').fill = this.fill(COLORS.paleRed);
    sheet.getRow(9).values = headers;
    this.styleHeader(sheet.getRow(9));
    widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
    for (let row = FIRST_DATA_ROW; row <= LAST_DATA_ROW; row += 1) {
      sheet.getRow(row).font = { name: 'Arial', size: 10, color: { argb: COLORS.ink } };
      sheet.getRow(row).alignment = { vertical: 'middle' };
    }
  }

  private writeInstructions(sheet: ExcelJS.Worksheet) {
    sheet.getRow(7).values = [
      'Step',
      'What to do',
      'Existing catalogue product',
      'New catalogue product',
    ];
    this.styleHeader(sheet.getRow(7));
    const rows = [
      [1, 'Choose the correct sheet', 'Use Existing Products', 'Use New Products'],
      [
        2,
        'Complete required yellow cells',
        'Select product, price, and stock',
        'Enter name, category, price, and stock',
      ],
      [
        3,
        'Review dropdowns and warnings',
        'Do not edit grey catalogue fields',
        'Use dropdowns where available',
      ],
      [
        4,
        'Upload and confirm',
        'Correct rejected rows before confirming',
        'New products may require admin approval',
      ],
    ];
    rows.forEach((values, index) => (sheet.getRow(8 + index).values = values));
    sheet.getRow(14).values = [
      'Generated automatically',
      'Product/store-offer IDs',
      'Store ID',
      'SKU and scan code when blank',
    ];
    sheet.getRow(15).values = [
      '',
      'Discounted price',
      'Validation/approval status',
      'Created and updated dates',
    ];
    sheet.getRow(18).values = ['File rule', 'Value', 'File rule', 'Value'];
    this.styleHeader(sheet.getRow(18));
    sheet.getRow(19).values = ['Accepted file', '.xlsx only', 'Maximum file size', '5 MB'];
    sheet.getRow(20).values = [
      'Maximum rows',
      '1,000 per product sheet',
      'Images',
      'Public HTTPS URLs',
    ];
    sheet.columns = [{ width: 26 }, { width: 42 }, { width: 38 }, { width: 42 }];
  }

  private validation(sheet: ExcelJS.Worksheet, row: number, column: number, values: string[]) {
    sheet.getCell(row, column).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${values.join(',')}"`],
    };
  }

  private addRequiredCellWarnings(sheet: ExcelJS.Worksheet, columns: number[]) {
    for (const column of columns) {
      const letter = sheet.getColumn(column).letter;
      sheet.addConditionalFormatting({
        ref: `${letter}${FIRST_DATA_ROW}:${letter}${LAST_DATA_ROW}`,
        rules: [
          {
            type: 'expression',
            priority: column,
            formulae: [
              `AND(COUNTA($A${FIRST_DATA_ROW}:$M${FIRST_DATA_ROW})>0,${letter}${FIRST_DATA_ROW}="")`,
            ],
            style: { fill: this.fill(COLORS.paleRed) },
          },
        ],
      });
    }
  }

  private styleHeader(row: ExcelJS.Row) {
    row.height = 42;
    row.eachCell((cell) => {
      cell.fill = this.fill(COLORS.ink);
      cell.font = { name: 'Arial', bold: true, size: 9, color: { argb: COLORS.white } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
  }

  private fill(argb: string): ExcelJS.Fill {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  }
}
