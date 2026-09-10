import {
  Body,
  Controller,
  createParamDecorator,
  Delete,
  ExecutionContext,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';

import { OkExample, StandardErrors } from '../common/api-docs';
import { Public } from '../auth/public.decorator';
import { StaffJwtGuard, AuthenticatedStaff } from './staff-jwt.guard';
import { AdminRoute } from '../auth/admin-route.decorator';
import { StaffService } from './staff.service';
import {
  CreateStaffUserDto,
  StaffChangePasswordDto,
  StaffLoginDto,
  UpdateStaffUserDto,
} from './dto/staff.dto';

/** Extracts the authenticated staff user (or a single property) from request.staffUser. */
const CurrentStaff = createParamDecorator(
  (property: keyof AuthenticatedStaff | undefined, ctx: ExecutionContext): unknown => {
    const req = ctx.switchToHttp().getRequest<{ staffUser: AuthenticatedStaff }>();
    return property ? req.staffUser?.[property] : req.staffUser;
  },
);

// ─── Auth Endpoints ───────────────────────────────────────────────────────────

@ApiTags('Admin Auth')
@Controller('admin/auth')
@AdminRoute()
@UseGuards(StaffJwtGuard)
export class StaffAuthController {
  constructor(private readonly staffService: StaffService) {}

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Staff login — issues purse_staff_token cookie' })
  @OkExample({
    mustChangePassword: false,
    staff: { id: 1, email: 'admin@purse.com', role: 'SUPER_ADMIN' },
  })
  @StandardErrors()
  async login(
    @Body() dto: StaffLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.staffService.login(
      dto,
      req.ip,
      req.headers['user-agent'],
    );

    res.cookie('purse_staff_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes — same as JWT_ACCESS_TTL
    });

    const { accessToken: _, ...safeResult } = result;
    return safeResult;
  }

  @Post('logout')
  @ApiCookieAuth('purse_staff_token')
  @ApiOperation({ summary: 'Staff logout — revokes the current session' })
  @OkExample({ loggedOut: true })
  async logout(
    @CurrentStaff('sessionId') sessionId: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.staffService.logout(sessionId);
    res.clearCookie('purse_staff_token');
    return result;
  }

  @Get('me')
  @ApiCookieAuth('purse_staff_token')
  @ApiOperation({ summary: 'Get current staff profile and permissions' })
  @OkExample({
    id: 1,
    email: 'admin@purse.com',
    firstName: 'Platform',
    lastName: 'Administrator',
    role: 'SUPER_ADMIN',
    permissions: ['admin.*'],
    mustChangePassword: false,
  })
  @StandardErrors()
  me(@CurrentStaff('id') staffId: number) {
    return this.staffService.me(staffId);
  }

  @Post('change-password')
  @ApiCookieAuth('purse_staff_token')
  @ApiOperation({ summary: 'Change staff password (required on first login)' })
  @OkExample({ passwordChanged: true })
  @StandardErrors()
  changePassword(
    @CurrentStaff('id') staffId: number,
    @Body() dto: StaffChangePasswordDto,
  ) {
    return this.staffService.changePassword(staffId, dto);
  }
}

// ─── Management Endpoints ─────────────────────────────────────────────────────

@ApiTags('Admin Staff Management')
@ApiCookieAuth('purse_staff_token')
@Controller('admin/staff')
@AdminRoute()
@UseGuards(StaffJwtGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new staff/admin user (SUPER_ADMIN only)' })
  @OkExample({
    id: 2,
    email: 'finance@purse.com',
    role: 'FINANCE_ADMIN',
    temporaryPassword: 'Xy@12bZq7P3!',
  })
  @StandardErrors()
  create(
    @Body() dto: CreateStaffUserDto,
    @CurrentStaff() actor: AuthenticatedStaff,
  ) {
    this.assertSuperAdmin(actor);
    return this.staffService.create(dto, actor.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all staff users (SUPER_ADMIN only)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @OkExample({
    items: [{ id: 1, email: 'admin@purse.com', role: 'SUPER_ADMIN', status: 'ACTIVE' }],
    pagination: { page: 1, limit: 20, total: 5, totalPages: 1 },
  })
  @StandardErrors()
  findAll(
    @CurrentStaff() actor: AuthenticatedStaff,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    this.assertSuperAdmin(actor);
    return this.staffService.findAll(page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a staff user by ID (SUPER_ADMIN only)' })
  @ApiParam({ name: 'id', example: 2 })
  @OkExample({ id: 2, email: 'ops@purse.com', role: 'OPERATIONS_ADMIN', status: 'ACTIVE' })
  @StandardErrors()
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentStaff() actor: AuthenticatedStaff,
  ) {
    this.assertSuperAdmin(actor);
    return this.staffService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a staff user (SUPER_ADMIN only)' })
  @ApiParam({ name: 'id', example: 2 })
  @OkExample({ id: 2, role: 'FINANCE_ADMIN', status: 'ACTIVE' })
  @StandardErrors()
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffUserDto,
    @CurrentStaff() actor: AuthenticatedStaff,
  ) {
    this.assertSuperAdmin(actor);
    return this.staffService.update(id, dto, actor.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a staff user (SUPER_ADMIN only)' })
  @ApiParam({ name: 'id', example: 2 })
  @OkExample({ id: 2, status: 'INACTIVE', deactivated: true })
  @StandardErrors()
  deactivate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentStaff() actor: AuthenticatedStaff,
  ) {
    this.assertSuperAdmin(actor);
    return this.staffService.deactivate(id, actor.id);
  }

  private assertSuperAdmin(actor: AuthenticatedStaff) {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN can manage staff users.');
    }
  }
}
