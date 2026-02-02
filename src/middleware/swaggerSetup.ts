/**
 * Swagger UI setup for FinOS API
 * Serves interactive API documentation
 */

import express, { type Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import { generateOpenAPISpec } from '../scripts/generateOpenAPI.js';

/**
 * Setup Swagger UI middleware
 * @param app Express application
 */
export function setupSwaggerUI(app: Express): void {
  const openAPISpec = generateOpenAPISpec();
  
  // Swagger UI options
  const swaggerOptions = {
    swaggerOptions: {
      persistAuthorization: true, // Persist auth across page refreshes
      displayRequestDuration: true,
      filter: true, // Enable filtering
      syntaxHighlight: {
        activate: true,
        theme: 'monokai',
      },
      tryItOutEnabled: true,
    },
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #2c5282; }
      .swagger-ui .scheme-container { background: #f7fafc; }
    `,
    customSiteTitle: 'FinOS API Documentation',
  };
  
  // Serve Swagger UI
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openAPISpec, swaggerOptions));
  
  // Serve raw OpenAPI spec as JSON
  app.get('/api-docs.json', (_req, res) => {
    res.json(openAPISpec);
  });
  
  console.log('📚 Swagger UI available at http://localhost:3000/api-docs');
  console.log('📄 OpenAPI spec available at http://localhost:3000/api-docs.json');
}
