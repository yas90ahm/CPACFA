/**
 * Swagger UI setup — QUARANTINED (optional; depends on swagger-ui-express and scripts outside src).
 * Original: src/middleware/swaggerSetup.ts. Move back to src when deps are in tree and generateOpenAPI is under src.
 */

import express, { type Express } from 'express';
// @ts-expect-error optional dependency
import swaggerUi from 'swagger-ui-express';
// Path would need to point to scripts/generateOpenAPI when used
// import { generateOpenAPISpec } from '../../scripts/generateOpenAPI.js';

export function setupSwaggerUI(app: Express): void {
  const openAPISpec = { openapi: '3.0.0', info: { title: 'FinOS API', version: '1.0.0' }, paths: {} };
  const swaggerOptions = {
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, filter: true },
    customSiteTitle: 'FinOS API Documentation',
  };
  app.use('/api-docs', (swaggerUi as { serve: unknown }).serve, (swaggerUi as { setup: (spec: unknown, opts: unknown) => unknown }).setup(openAPISpec, swaggerOptions));
  app.get('/api-docs.json', (_req, res) => res.json(openAPISpec));
}
