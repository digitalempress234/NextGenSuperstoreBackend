import { Body, Controller, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiCookieAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { OkExample, StandardErrors } from '../common/api-docs';
import { CurrentUser } from '../common/current-user.decorator';
import { Public } from './public.decorator';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { GoogleSignInDto } from './dto/google-auth.dto';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ResendEmailOtpDto,
  ResetPasswordDto,
  VerifyEmailOtpDto,
} from './dto/auth.dto';

const ACCESS_COOKIE = 'purse_access_token';
const REFRESH_COOKIE = 'purse_refresh_token';

@ApiTags('Authentication')
@ApiCookieAuth('purse_access_token')
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register and send email verification OTP' })
  @OkExample({
    user: { id: 1001, email: 'customer@example.com' },
    verificationRequired: true,
  })
  @StandardErrors()
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('verify-email')
  @ApiOperation({ summary: 'Verify an account email address using a 6-digit OTP' })
  @OkExample({ verified: true })
  @StandardErrors()
  async verifyEmail(@Body() dto: VerifyEmailOtpDto) {
    return this.authService.verifyEmailOtp(dto);
  }

  @Public()
  @Post('resend-email-otp')
  @ApiOperation({ summary: 'Resend the email verification OTP' })
  @OkExample({ accepted: true })
  @StandardErrors()
  async resendEmailOtp(@Body() dto: ResendEmailOtpDto) {
    return this.authService.resendEmailOtp(dto);
  }

  @Public()
  @Post('google')
  @ApiOperation({ summary: 'Sign in or sign up with Google Identity Services' })
  @OkExample({
    user: { id: 1001, email: 'customer@gmail.com', roles: ['CUSTOMER'] },
    session: { authenticated: true },
  })
  @StandardErrors()
  async googleSignIn(
    @Body() dto: GoogleSignInDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.googleAuthService.signIn(dto.idToken);
    await this.authService.updateSessionMetadata(result.sessionId, request);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return this.publicAuthResponse(result, dto.clientType === 'MOBILE');
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Authenticate using secure HttpOnly cookies' })
  @OkExample({
    user: { id: 1001, email: 'customer@example.com', roles: ['CUSTOMER'] },
    session: { authenticated: true },
  })
  @StandardErrors()
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);
    await this.authService.updateSessionMetadata(result.sessionId, request);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return this.publicAuthResponse(result, dto.clientType === 'MOBILE');
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request a password-reset OTP by email' })
  @OkExample({ accepted: true })
  @StandardErrors()
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using the OTP received by email' })
  @OkExample({ passwordReset: true })
  @StandardErrors()
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @Post('refresh')
  @ApiCookieAuth('purse_refresh_token')
  @ApiOperation({
    summary: 'Rotate an access/refresh session',
    description:
      'Web clients send the HttpOnly refresh cookie. Native clients send refreshToken and clientType=MOBILE and receive the rotated tokens in the response body.',
  })
  @OkExample({
    user: { id: 1001, email: 'customer@example.com', roles: ['CUSTOMER'] },
    session: { authenticated: true },
  })
  @StandardErrors()
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken =
      dto.refreshToken ?? (request.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh authentication cookie is missing.');
    }

    const result = await this.authService.refreshToken(refreshToken);
    await this.authService.updateSessionMetadata(result.sessionId, request);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return this.publicAuthResponse(
      result,
      dto.clientType === 'MOBILE' || Boolean(dto.refreshToken),
    );
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke the current browser session and clear cookies' })
  @ApiNoContentResponse({ description: 'Session revoked and authentication cookies cleared.' })
  @StandardErrors()
  async logout(
    @CurrentUser('sessionId') sessionId: number,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(sessionId);
    this.clearAuthCookies(response);
  }

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string): void {
    const options = this.cookieOptions();
    if (options.path !== '/purse') {
      response.clearCookie(ACCESS_COOKIE, { ...options, path: '/purse' });
      response.clearCookie(REFRESH_COOKIE, { ...options, path: '/purse' });
    }
    response.cookie(ACCESS_COOKIE, accessToken, {
      ...options,
      maxAge: this.authService.accessTokenTtlMs(),
    });
    response.cookie(REFRESH_COOKIE, refreshToken, {
      ...options,
      maxAge: this.authService.refreshTokenTtlMs(),
    });
  }

  private clearAuthCookies(response: Response): void {
    const options = this.cookieOptions();
    response.clearCookie(ACCESS_COOKIE, options);
    response.clearCookie(REFRESH_COOKIE, options);
    response.clearCookie(ACCESS_COOKIE, { ...options, path: '/purse' });
    response.clearCookie(REFRESH_COOKIE, { ...options, path: '/purse' });
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

  private publicAuthResponse(
    result: Awaited<ReturnType<AuthService['login']>>,
    includeTokens = false,
  ) {
    if (!('user' in result) || !('sessionId' in result)) {
      throw new UnauthorizedException('Authentication could not be completed.');
    }
    return {
      user: result.user,
      session: { authenticated: true },
      ...(includeTokens
        ? {
            tokens: {
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              tokenType: 'Bearer',
              expiresIn: Math.floor(this.authService.accessTokenTtlMs() / 1000),
            },
          }
        : {}),
    };
  }
}
