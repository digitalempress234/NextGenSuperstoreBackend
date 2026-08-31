import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
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
    schema: {
      example: {
        success: true,
        data: example,
        requestId: 'req_01JABC123',
      },
    },
  });
}
