import { Body, Controller, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiCookieAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  ResendEmailOtpDto,
  ResetPasswordDto,
  VerifyEmailOtpDto,
} from './dto/auth.dto';

const ACCESS_COOKIE = 'purse_access_token';
const REFRESH_COOKIE = 'purse_refresh_token';

const cookieOptions = {
  httpOnly: true,
  secure: process.env.AUTH_COOKIE_SECURE === 'true',
  sameSite: 'lax' as const,
  path: '/purse',
};

@ApiTags('Authentication')
@ApiCookieAuth('purse_access_token')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuthService: GoogleAuthService,
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
    return this.publicAuthResponse(result);
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
    return this.publicAuthResponse(result);
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
  @ApiOperation({ summary: 'Rotate access and refresh cookies' })
  @OkExample({
    user: { id: 1001, email: 'customer@example.com', roles: ['CUSTOMER'] },
    session: { authenticated: true },
  })
  @StandardErrors()
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh authentication cookie is missing.');
    }

    const result = await this.authService.refreshToken(refreshToken);
    await this.authService.updateSessionMetadata(result.sessionId, request);
    this.setAuthCookies(response, result.accessToken, result.refreshToken);
    return this.publicAuthResponse(result);
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
    response.cookie(ACCESS_COOKIE, accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });
    response.cookie(REFRESH_COOKIE, refreshToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookies(response: Response): void {
    response.clearCookie(ACCESS_COOKIE, cookieOptions);
    response.clearCookie(REFRESH_COOKIE, cookieOptions);
  }

  private publicAuthResponse(result: Awaited<ReturnType<AuthService['login']>>) {
    if (!('user' in result) || !('sessionId' in result)) {
      throw new UnauthorizedException('Authentication could not be completed.');
    }
    return {
      user: result.user,
      session: { authenticated: true },
    };
  }
}
