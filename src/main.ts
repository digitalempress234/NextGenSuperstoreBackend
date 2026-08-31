import { RequestContextService } from './logging/request-context.service';
import { RequestContextInterceptor } from './logging/request-context.interceptor';
import { AllExceptionsFilter } from './logging/all-exceptions.filter';
import { AppLoggerService } from './logging/app-logger.service';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { setupScalarDocs } from './docs/setup-docs';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const logger = app.get(AppLoggerService);
  app.useLogger(logger);
  app.useGlobalInterceptors(
    app.get(RequestContextInterceptor),
  );
  const requestContext = app.get(RequestContextService);

  app.setGlobalPrefix('purse');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
        fontSrc: ["'self'", "https:", "data:"],
        imgSrc: ["'self'", "data:", "validator.swagger.io", "https://cdn.jsdelivr.net"],
        connectSrc: ["'self'", "https://api.scalar.com", "https://cdn.jsdelivr.net"],
      },
    },
  }));
  app.use(compression());
  app.use(cookieParser());
  const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (allowedOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must contain at least one allowed frontend origin.');
  }

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-Request-Id'],
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  setupScalarDocs(app);

  // Prisma handles shutdown hooks automatically in version 5+

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
