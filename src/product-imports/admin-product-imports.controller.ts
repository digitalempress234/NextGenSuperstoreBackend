import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { AdminRoute } from '../auth/admin-route.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { StandardErrors } from '../common/api-docs';
import { AuthenticatedStaff, StaffJwtGuard } from '../staff/staff-jwt.guard';
import { StaffPermissionGuard } from '../staff/staff-permission.guard';
import { AdminProductImportQueryDto, ReviewProductImportDto } from './dto/product-import.dto';
import { ProductImportsService } from './product-imports.service';

const EXCEL_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendWorkbook(response: Response, filename: string, document: Buffer) {
  response.setHeader('Content-Type', EXCEL_CONTENT_TYPE);
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.setHeader('Cache-Control', 'private, no-store');
  response.send(document);
}

@ApiTags('Admin product imports')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard, StaffPermissionGuard)
@RequirePermissions('products.bulk.import')
@Controller('admin/product-imports')
export class AdminProductImportsController {
  constructor(private readonly imports: ProductImportsService) {}

  @Get('template')
  @ApiOperation({ summary: 'Staff: download an OhoO bulk-product template for a store' })
  @ApiProduces(EXCEL_CONTENT_TYPE)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @StandardErrors()
  async template(@Query('storeId', ParseIntPipe) storeId: number, @Res() response: Response) {
    sendWorkbook(
      response,
      'OhoO_Bulk_Product_Upload_Template.xlsx',
      await this.imports.adminTemplate(storeId),
    );
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiOperation({ summary: 'Staff: upload and validate a product workbook for a store' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['storeId', 'file'],
      properties: {
        storeId: { type: 'integer', example: 6 },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @StandardErrors()
  upload(
    @Req() request: { staffUser: AuthenticatedStaff },
    @Body('storeId', ParseIntPipe) storeId: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.imports.adminUpload(request.staffUser.id, storeId, file);
  }

  @Get()
  @ApiOperation({ summary: 'Staff: list product imports across stores' })
  list(@Query() query: AdminProductImportQueryDto) {
    return this.imports.adminList(query);
  }

  @Get(':importId/errors')
  @ApiOperation({ summary: 'Staff: download an Excel workbook containing validation errors' })
  @ApiProduces(EXCEL_CONTENT_TYPE)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async errors(@Param('importId', ParseIntPipe) importId: number, @Res() response: Response) {
    sendWorkbook(
      response,
      `OhoO_Product_Import_${importId}_Errors.xlsx`,
      await this.imports.adminErrors(importId),
    );
  }

  @Post(':importId/commit')
  @ApiOperation({ summary: 'Staff: confirm a validated product import' })
  @StandardErrors()
  commit(
    @Req() request: { staffUser: AuthenticatedStaff },
    @Param('importId', ParseIntPipe) importId: number,
  ) {
    return this.imports.adminCommit(request.staffUser.id, importId);
  }

  @Post(':importId/review')
  @ApiOperation({
    summary: 'Staff: approve or reject vendor-submitted new catalogue products',
    description: 'Multiple pending rows can be reviewed atomically in one request.',
  })
  @StandardErrors()
  review(
    @Req() request: { staffUser: AuthenticatedStaff },
    @Param('importId', ParseIntPipe) importId: number,
    @Body() dto: ReviewProductImportDto,
  ) {
    return this.imports.review(request.staffUser.id, importId, dto);
  }

  @Get(':importId')
  @ApiOperation({ summary: 'Staff: get one product import with validation errors' })
  @StandardErrors()
  one(@Param('importId', ParseIntPipe) importId: number) {
    return this.imports.adminOne(importId);
  }
}
