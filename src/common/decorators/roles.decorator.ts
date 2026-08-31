import { SetMetadata } from '@nestjs/common';

export const REQUIRED_ROLES = 'requiredRoles';
export const RequireRoles = (...roles: string[]) => SetMetadata(REQUIRED_ROLES, roles);
