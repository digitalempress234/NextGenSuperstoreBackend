import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { OkExample, StandardErrors } from '../common/api-docs';

import { UploadsService } from './uploads.service';

@ApiTags('Uploads')
@ApiCookieAuth('purse_access_token')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an authenticated image or KYC document attachment' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @OkExample({
    url: 'https://res.cloudinary.com/...',
    publicId: 'purse/...',
    resourceType: 'image',
  })
  @StandardErrors()
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('A file is required.');
    }

    const result = await this.uploadsService.upload(file.buffer, 'purse');

    return {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
    };
  }
}
