import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Public } from '../auth/public.decorator';

@Controller('branding')
export class BrandingController {
  @Public()
  @Get('logo.png')
  logoPng(@Res() response: Response) {
    return this.send(response, 'ohoo-logo.png', 'image/png');
  }

  @Public()
  @Get('logo.svg')
  logoSvg(@Res() response: Response) {
    return this.send(response, 'ohoo-logo.svg', 'image/svg+xml');
  }

  private send(response: Response, filename: string, contentType: string) {
    const path = join(__dirname, 'assets', filename);
    if (!existsSync(path)) return response.status(404).send('Brand asset not found.');
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return response.sendFile(path);
  }
}
