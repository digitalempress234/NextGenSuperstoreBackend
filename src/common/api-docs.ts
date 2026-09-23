import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiExtension,
} from '@nestjs/swagger';

export function AuthenticatedApi(): any {
  return (_target: any, _propertyKey?: any, descriptor?: any) => {
    ApiCookieAuth('purse_access_token')(_target, _propertyKey, descriptor);
    ApiUnauthorizedResponse({
      description: 'Authentication required or authentication cookie is invalid.',
      schema: {
        example: {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        },
      },
    })(_target, _propertyKey, descriptor);
    return descriptor as PropertyDescriptor;
  };
}

export const StandardErrors = (): MethodDecorator => {
  return (target, propertyKey, descriptor) => {
    ApiBadRequestResponse({
      description: 'Validation or business rule error.',
      schema: {
        example: {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request.',
            details: [],
          },
          requestId: 'req_01JABC123',
        },
      },
    })(target, propertyKey, descriptor);
    ApiForbiddenResponse({
      description: 'Authenticated but not authorized.',
      schema: {
        example: {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Permission denied.',
          },
        },
      },
    })(target, propertyKey, descriptor);
    ApiNotFoundResponse({
      description: 'Resource not found.',
      schema: {
        example: {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Resource not found.',
          },
        },
      },
    })(target, propertyKey, descriptor);
    ApiInternalServerErrorResponse({
      description: 'Unexpected server error.',
    })(target, propertyKey, descriptor);
    return descriptor;
  };
};

export function OkExample(example: unknown, description = 'Successful response.') {
  return ApiOkResponse({
    description,
    schema: { example },
  });
}

export function CreatedExample(example: unknown, description = 'Created successfully.') {
  return ApiCreatedResponse({ description, schema: { example } });
}

/**
 * Attaches an x-required-permissions extension visible in Swagger/Scalar
 * and adds the standard 401 Unauthorized response.
 * Use on every protected endpoint alongside @RequirePermissions().
 *
 * @param permissions 
 * @param roles        
 */
export function RequireAuth(
  permissions: string[],
  roles?: string[],
): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    const roleNote = roles?.length
      ? `Required roles: ${roles.join(', ')}.`
      : '';
    const permNote = `Required permission(s): \`${permissions.join('`, `')}\`.`;
    ApiExtension('x-required-permissions', permissions)(target, propertyKey, descriptor);
    if (roles?.length) {
      ApiExtension('x-required-roles', roles)(target, propertyKey, descriptor);
    }
    ApiUnauthorizedResponse({
      description: 'Authentication cookie is missing or invalid.',
      schema: {
        example: {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
        },
      },
    })(target, propertyKey, descriptor);
    ApiForbiddenResponse({
      description: `${permNote} ${roleNote}`.trim(),
      schema: {
        example: {
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have the required permission.' },
        },
      },
    })(target, propertyKey, descriptor);
    return descriptor;
  };
}
