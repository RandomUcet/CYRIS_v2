import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { Logger } from '@nestjs/common';
import { sanitizeRequestId } from './request-identity.js';
import { AppModule } from './app.module.js';
import { ConfigService } from './modules/config/config.service.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('CYRIS-API');

  const fastifyAdapter = new FastifyAdapter({
    logger: false,
    // Accommodate 5 MiB raster image base64 payloads. Per-route service validates magic, size and permission.
    bodyLimit: 8 * 1024 * 1024,
    genReqId: (req: any) => sanitizeRequestId(req.headers['x-request-id']),
    // Fastify otherwise trusts the raw header and skips genReqId entirely.
    // Always invoke the validator before generating/auditing X-Request-ID.
    requestIdHeader: false,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter
  );

  const configService = app.get(ConfigService);

  // Set X-Request-ID and standard security headers
  const fastifyInstance = app.getHttpAdapter().getInstance();

  // Configure Node HTTP keep-alive timeouts to prevent ECONNRESET in client/reverse proxy
  fastifyInstance.server.keepAliveTimeout = 65000;
  fastifyInstance.server.headersTimeout = 66000;

  fastifyInstance.addHook('onSend', async (request: any, reply: any) => {
    if (request.id) {
      reply.header('X-Request-ID', request.id);
    }
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self';"
    );
    const isHttps = request.headers['x-forwarded-proto'] === 'https' ||
      (request.headers['origin'] as string)?.startsWith('https://') ||
      request.raw?.socket?.encrypted;
    if (configService.isProduction && isHttps) {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });

  // Register cookie support
  await app.register(fastifyCookie as any, {
    secret: configService.values.CYRIS_MASTER_KEY,
  });

  // Register multipart support for streaming file uploads
  await app.register(fastifyMultipart as any, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100 MB max file size
      files: 1,
    },
  });

  // Enable CORS for Next.js web application and future frontend clients
  app.enableCors({
    origin: [new URL(configService.values.PUBLIC_WEB_URL).origin],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  const port = configService.port;
  await app.listen(port, '0.0.0.0');

  logger.log(`================================================================`);
  logger.log(`  CYRIS v2 API Server running on http://localhost:${port}`);
  logger.log(`  Health Check:     http://localhost:${port}/health`);
  logger.log(`  Readiness Check:  http://localhost:${port}/health/ready`);
  logger.log(`================================================================`);
}

void bootstrap();
