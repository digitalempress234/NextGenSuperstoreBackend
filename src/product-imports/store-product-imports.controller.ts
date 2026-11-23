import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { StandardErrors } from '../common/api-docs';
import { ProductImportQueryDto } from './dto/product-import.dto';
import { ProductImportsService } from './product-imports.service';

const EXCEL_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendWorkbook(response: Response, filename: string, document: Buffer) {
  response.setHeader('Content-Type', EXCEL_CONTENT_TYPE);
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.setHeader('Cache-Control', 'private, no-store');
  response.send(document);
}

@ApiTags('Store product imports')
@ApiCookieAuth('purse_access_token')
@ApiBearerAuth('mobile_bearer')
@Controller('stores/:storeId/product-imports')
export class StoreProductImportsController {
  constructor(private readonly imports: ProductImportsService) {}

  @Get('template')
  @RequirePermissions('products.bulk.import')
  @ApiOperation({
    summary: 'Vendor: download the store-specific OhoO bulk-product Excel template',
    description:
      'Generates an .xlsx workbook containing live catalogue-product and category dropdowns. The store must be approved and active.',
  })
  @ApiParam({ name: 'storeId', example: 6 })
  @ApiProduces(EXCEL_CONTENT_TYPE)
  @ApiOkResponse({
    description: 'Branded OhoO Excel template',
    schema: { type: 'string', format: 'binary' },
  })
  @StandardErrors()
  async template(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Res() response: Response,
  ) {
    sendWorkbook(
      response,
      'OhoO_Bulk_Product_Upload_Template.xlsx',
      await this.imports.vendorTemplate(userId, storeId),
    );
  }

  @Post()
  @RequirePermissions('products.bulk.import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiOperation({ summary: 'Vendor: upload and validate a completed bulk-product workbook' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({
    description: 'Staged import with validation totals and row-level errors',
    schema: {
      example: {
        id: 124,
        storeId: 6,
        status: 'READY',
        totalRows: 84,
        validRows: 84,
        invalidRows: 0,
        existingProductRows: 78,
        newProductRows: 6,
        errors: [],
      },
    },
  })
  @StandardErrors()
  upload(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.imports.vendorUpload(userId, storeId, file);
  }

  @Get()
  @RequirePermissions('products.bulk.import')
  @ApiOperation({ summary: 'Vendor: list store bulk-product imports' })
  @ApiOkResponse({
    schema: {
      example: { items: [], total: 0, page: 1, limit: 15, pages: 0 },
    },
  })
  list(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query() query: ProductImportQueryDto,
  ) {
    return this.imports.vendorList(userId, storeId, query);
  }

  @Get(':importId/errors')
  @RequirePermissions('products.bulk.import')
  @ApiOperation({ summary: 'Vendor: download an Excel workbook containing validation errors' })
  @ApiProduces(EXCEL_CONTENT_TYPE)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async errors(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('importId', ParseIntPipe) importId: number,
    @Res() response: Response,
  ) {
    sendWorkbook(
      response,
      `OhoO_Product_Import_${importId}_Errors.xlsx`,
      await this.imports.vendorErrors(userId, storeId, importId),
    );
  }

  @Post(':importId/commit')
  @RequirePermissions('products.bulk.import')
  @ApiOperation({
    summary: 'Vendor: confirm a validated product import',
    description:
      'Existing catalogue offers are created or updated. New catalogue products remain pending until staff approval.',
  })
  @StandardErrors()
  commit(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('importId', ParseIntPipe) importId: number,
  ) {
    return this.imports.vendorCommit(userId, storeId, importId);
  }

  @Get(':importId')
  @RequirePermissions('products.bulk.import')
  @ApiOperation({ summary: 'Vendor: get validation and processing status for one import' })
  @StandardErrors()
  one(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('importId', ParseIntPipe) importId: number,
  ) {
    return this.imports.vendorOne(userId, storeId, importId);
  }
}
