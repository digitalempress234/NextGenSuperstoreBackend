import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/current-user.decorator';
import { StandardErrors } from '../common/api-docs';
import { Public } from './public.decorator';
import {
  PasskeyRegistrationOptionsDto,
  VerifyPasskeyLoginDto,
  VerifyPasskeyRegistrationDto,
} from './dto/passkey.dto';
import { PasskeyService } from './passkey.service';
import { AuthService } from './auth.service';

@ApiTags('Authentication - Passkeys')
@Controller('auth/passkeys')
export class PasskeyController {
  constructor(
    private readonly passkeys: PasskeyService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register/options')
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({ summary: 'Create passkey registration options for the signed-in user' })
  @StandardErrors()
  registerOptions(@CurrentUser('id') userId: number, @Body() dto: PasskeyRegistrationOptionsDto) {
    return this.passkeys.registrationOptions(userId, dto.label);
  }

  @Post('register/verify')
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({ summary: 'Verify and save a passkey registration response' })
  @StandardErrors()
  registerVerify(@CurrentUser('id') userId: number, @Body() dto: VerifyPasskeyRegistrationDto) {
    return this.passkeys.verifyRegistration(
      userId,
      dto.response as unknown as RegistrationResponseJSON,
      dto.label,
    );
  }

  @Public()
  @Post('login/options')
  @ApiOperation({ summary: 'Create discoverable passkey login options' })
  loginOptions() {
    return this.passkeys.authenticationOptions();
  }

  @Public()
  @Post('login/verify')
  @ApiOperation({ summary: 'Verify passkey login and issue a new session' })
  async loginVerify(
    @Body() dto: VerifyPasskeyLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.passkeys.verifyAuthentication(
      dto.challenge,
      dto.response as unknown as AuthenticationResponseJSON,
    );
    await this.auth.updateSessionMetadata(result.sessionId, request);
    const options = this.cookieOptions();
    response.cookie('purse_access_token', result.accessToken, {
      ...options,
      maxAge: this.auth.accessTokenTtlMs(),
    });
    response.cookie('purse_refresh_token', result.refreshToken, {
      ...options,
      maxAge: this.auth.refreshTokenTtlMs(),
    });
    return {
      user: result.user,
      session: { authenticated: true },
      ...(dto.clientType === 'MOBILE'
        ? {
            tokens: {
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              tokenType: 'Bearer',
              expiresIn: Math.floor(this.auth.accessTokenTtlMs() / 1000),
            },
          }
        : {}),
    };
  }

  @Get()
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({ summary: 'List registered passkeys' })
  list(@CurrentUser('id') userId: number) {
    return this.passkeys.list(userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({ summary: 'Remove a registered passkey' })
  remove(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.passkeys.remove(userId, id);
  }

  private cookieOptions() {
    const sameSite = this.config.get<string>('AUTH_COOKIE_SAME_SITE', 'lax').toLowerCase();
    return {
      httpOnly: true,
      secure:
        this.config.get<string>('AUTH_COOKIE_SECURE') === 'true' ||
        (this.config.get<string>('AUTH_COOKIE_SECURE') !== 'false' &&
          this.config.get<string>('NODE_ENV') === 'production'),
      sameSite: (['lax', 'strict', 'none'].includes(sameSite) ? sameSite : 'lax') as
        'lax' | 'strict' | 'none',
      path: this.config.get<string>('AUTH_COOKIE_PATH', '/'),
      ...(this.config.get<string>('AUTH_COOKIE_DOMAIN')
        ? { domain: this.config.get<string>('AUTH_COOKIE_DOMAIN') }
        : {}),
    };
  }
}
