import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AuthenticatedUser } from './types';

export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return property ? request.user?.[property] : request.user;
  },
);
