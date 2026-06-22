import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS — CORS_ORIGIN can be comma-separated for multiple origins
  const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080,http://localhost:8090')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger/OpenAPI Configuration
  const config = new DocumentBuilder()
    .setTitle('Veerha WMS API')
    .setDescription('Enterprise Warehouse Management System - RESTful API Documentation')
    .setVersion('1.0.0')
    .setContact(
      'Veerha WMS Team',
      'https://veerha.com',
      'support@veerha.com'
    )
    .setLicense('Proprietary', 'https://veerha.com/license')
    .addServer('http://localhost:3000', 'Development Server')
    .addServer('https://api.veerha.com', 'Production Server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('SKUs', 'Product SKU management and catalog operations')
    .addTag('Inventory', 'Stock levels, transfers, and adjustments')
    .addTag('Batches', 'Batch tracking and expiry management')
    .addTag('Damaged Items', 'Damaged goods reporting and disposition')
    .addTag('Warehouses', 'Warehouse and location management')
    .addTag('Zones', 'Zone configuration and management')
    .addTag('Racks', 'Rack and storage management')
    .addTag('Bins', 'Bin-level inventory locations')
    .addTag('Dashboard', 'Analytics and reporting endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true,
  });

  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
      tryItOutEnabled: true,
    },
    customSiteTitle: 'Veerha WMS API Documentation',
  });

  // Health check endpoint
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ReDoc API Documentation
  httpAdapter.get('/api/redoc', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
  <head>
    <title>Veerha WMS API Reference</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet">
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <redoc spec-url='/api/docs-json'></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`);
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
  console.log(`📚 API Documentation (Swagger) available at http://localhost:${port}/api/docs`);
  console.log(`📖 API Reference (ReDoc) available at http://localhost:${port}/api/redoc`);
}

bootstrap();
