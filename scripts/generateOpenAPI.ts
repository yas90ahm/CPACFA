/**
 * OpenAPI Documentation Generator
 * Generates Swagger/OpenAPI spec from Zod schemas
 */

import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Import all schema files
import * as authSchemas from '../src/schemas/authSchemas.js';
import * as trialBalanceSchemas from '../src/schemas/trialBalanceSchemas.js';
import * as closeSchemas from '../src/schemas/closeSchemas.js';
import * as stockCompSchemas from '../src/schemas/stockCompSchemas.js';
import * as dcfSchemas from '../src/schemas/dcfSchemas.js';
import * as deferredTaxSchemas from '../src/schemas/deferredTaxSchemas.js';
import * as impairmentSchemas from '../src/schemas/impairmentSchemas.js';
import * as businessCombinationSchemas from '../src/schemas/businessCombinationSchemas.js';
import * as equityMethodSchemas from '../src/schemas/equityMethodSchemas.js';
import * as compsSchemas from '../src/schemas/compsSchemas.js';
import * as precedentSchemas from '../src/schemas/precedentSchemas.js';
import * as portfolioSchemas from '../src/schemas/portfolioSchemas.js';
import * as segmentSchemas from '../src/schemas/segmentSchemas.js';
import * as auditSchemas from '../src/schemas/auditSchemas.js';
import * as revenueRecognitionSchemas from '../src/schemas/revenueRecognitionSchemas.js';

// Initialize OpenAPI registry
const registry = new OpenAPIRegistry();

// Register components (schemas)
function registerSchemas() {
  // Auth schemas
  registry.register('LoginSchema', authSchemas.loginSchema);
  registry.register('RegisterSchema', authSchemas.registerSchema);
  
  // Stock Compensation schemas
  registry.register('CreateGrantSchema', stockCompSchemas.createGrantSchema);
  registry.register('BlackScholesInputSchema', stockCompSchemas.blackScholesInputSchema);
  registry.register('ExpenseCalculationSchema', stockCompSchemas.calculateExpenseSchema);
  
  // DCF schemas
  registry.register('CreateDCFModelSchema', dcfSchemas.createDCFModelSchema);
  registry.register('CalculateDCFSchema', dcfSchemas.calculateDCFSchema);
  registry.register('WACCInputSchema', dcfSchemas.waccInputSchema);
  registry.register('SensitivityAnalysisSchema', dcfSchemas.sensitivityAnalysisSchema);
  
  // Deferred Tax schemas
  registry.register('CalculateDeferredTaxSchema', deferredTaxSchemas.calculateDeferredTaxBodySchema);
  registry.register('CreateDeferredTaxItemSchema', deferredTaxSchemas.createDeferredTaxItemSchema);
  registry.register('CreateValuationAllowanceSchema', deferredTaxSchemas.createValuationAllowanceSchema);
  
  // Impairment schemas
  registry.register('CreateCGUSchema', impairmentSchemas.createCGUSchema);
  registry.register('AllocateGoodwillSchema', impairmentSchemas.allocateGoodwillSchema);
  registry.register('PerformImpairmentTestSchema', impairmentSchemas.performImpairmentTestSchema);
  
  // Business Combination schemas
  registry.register('CreateAcquisitionSchema', businessCombinationSchemas.createAcquisitionSchema);
  registry.register('AddPPALineItemSchema', businessCombinationSchemas.addPPALineItemSchema);
  registry.register('AddContingentConsiderationSchema', businessCombinationSchemas.addContingentConsiderationSchema);
  
  // Equity Method schemas
  registry.register('CreateInvestmentSchema', equityMethodSchemas.createInvestmentSchema);
  registry.register('RecordIncomeSchema', equityMethodSchemas.recordIncomeSchema);
  
  // Comps schemas
  registry.register('CreateComparableSetSchema', compsSchemas.createComparableSetSchema);
  registry.register('AddComparableSchema', compsSchemas.addComparableSchema);
  registry.register('CalculateValuationSchema', compsSchemas.calculateValuationSchema);
  
  // Add more schema registrations...
}

// Register paths (routes)
function registerPaths() {
  // Auth routes
  registry.registerPath({
    method: 'post',
    path: '/api/auth/login',
    description: 'User login',
    summary: 'Authenticate user and return JWT token',
    tags: ['Authentication'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: authSchemas.loginSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Login successful',
        content: {
          'application/json': {
            schema: z.object({
              token: z.string(),
              user: z.object({
                id: z.string(),
                email: z.string(),
                tenantId: z.string(),
              }),
            }),
          },
        },
      },
      400: {
        description: 'Validation failed',
      },
      401: {
        description: 'Invalid credentials',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/auth/register',
    description: 'User registration',
    summary: 'Create new user account',
    tags: ['Authentication'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: authSchemas.registerSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Registration successful',
      },
      400: {
        description: 'Validation failed',
      },
    },
  });

  // Stock Compensation routes
  registry.registerPath({
    method: 'post',
    path: '/api/stock-comp/grants',
    description: 'Create stock grant',
    summary: 'Create a new equity compensation grant (RSU, option, PSU)',
    tags: ['Stock Compensation'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: stockCompSchemas.createGrantSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Grant created successfully',
      },
      400: {
        description: 'Validation failed',
      },
      401: {
        description: 'Unauthorized',
      },
    },
  });

  // DCF Valuation routes
  registry.registerPath({
    method: 'post',
    path: '/api/valuation/dcf',
    description: 'Create DCF valuation model',
    summary: 'Create and save a discounted cash flow valuation model',
    tags: ['DCF Valuation'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: dcfSchemas.createDCFModelSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'DCF model created',
      },
      400: {
        description: 'Validation failed',
      },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/api/valuation/dcf/calculate',
    description: 'Calculate DCF without saving',
    summary: 'Perform DCF calculation without persisting to database',
    tags: ['DCF Valuation'],
    request: {
      body: {
        content: {
          'application/json': {
            schema: dcfSchemas.calculateDCFSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'DCF calculation result',
        content: {
          'application/json': {
            schema: z.object({
              enterpriseValue: z.number(),
              equityValue: z.number(),
              pricePerShare: z.number(),
              pvOfCashFlows: z.array(z.number()),
              terminalValue: z.number(),
            }),
          },
        },
      },
      400: {
        description: 'Validation failed',
      },
    },
  });

  // Deferred Tax routes
  registry.registerPath({
    method: 'post',
    path: '/api/deferred-tax/calculate',
    description: 'Calculate deferred tax position',
    summary: 'Calculate DTA/DTL for a period',
    tags: ['Deferred Tax (ASC 740)'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: deferredTaxSchemas.calculateDeferredTaxBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Deferred tax calculation complete',
      },
      400: {
        description: 'Validation failed',
      },
    },
  });

  // Business Combination routes
  registry.registerPath({
    method: 'post',
    path: '/api/business-combination',
    description: 'Create acquisition record',
    summary: 'Record a business acquisition for PPA analysis',
    tags: ['Business Combinations (ASC 805)'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: businessCombinationSchemas.createAcquisitionSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Acquisition created',
      },
      400: {
        description: 'Validation failed',
      },
    },
  });

  // Add more path registrations...
}

// Generate OpenAPI spec
export function generateOpenAPISpec() {
  registerSchemas();
  registerPaths();

  const generator = new OpenApiGeneratorV3(registry.definitions);

  const openAPISpec = generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Sabit API - Financial Close Automation Engine',
      version: '1.0.0',
      description: `
# Sabit API Documentation

A comprehensive API for CPA and CFA operations including:

## CPA Features (GAAP/IFRS Compliance)
- **ASC 718** - Stock-Based Compensation
- **ASC 740** - Deferred Tax (Income Taxes)
- **ASC 350** - Impairment Testing (Goodwill & Intangibles)
- **ASC 805** - Business Combinations (M&A, PPA)
- **ASC 323** - Equity Method Investments
- **ASC 606 / IFRS 15** - Revenue Recognition
- **IFRS 8 / ASC 280** - Segment Reporting
- **Month-End Close** - Accruals, JE suggestions, checklists
- **Trial Balance** - Financial statement generation

## CFA Features (Valuation & Analysis)
- **DCF Valuation** - Discounted Cash Flow models with WACC
- **Comparable Analysis** - Public comps, multiples, adjustments
- **Precedent Transactions** - M&A comps, premiums
- **Portfolio Analytics** - Performance, risk, attribution

## AI-Powered Features
All major modules include agentic AI capabilities for intelligent suggestions, analysis, and automation.

## Authentication
All endpoints (except /auth/*) require Bearer token authentication.
      `,
      contact: {
        name: 'Sabit Support',
        email: 'support@sabit.com',
      },
      license: {
        name: 'Proprietary',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local development server',
      },
      {
        url: 'https://api.sabit.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/login',
        },
      },
    },
    tags: [
      { name: 'Authentication', description: 'User authentication and registration' },
      { name: 'Stock Compensation', description: 'ASC 718 - Stock-based compensation (RSUs, options, PSUs)' },
      { name: 'DCF Valuation', description: 'CFA - Discounted Cash Flow valuation models' },
      { name: 'Deferred Tax (ASC 740)', description: 'Income tax accounting - DTA/DTL, valuation allowance' },
      { name: 'Impairment Testing (ASC 350)', description: 'Goodwill and intangible asset impairment' },
      { name: 'Business Combinations (ASC 805)', description: 'M&A accounting, purchase price allocation' },
      { name: 'Equity Method (ASC 323)', description: 'Equity method investments and joint ventures' },
      { name: 'Comparable Analysis', description: 'CFA - Public company comparables valuation' },
      { name: 'Precedent Transactions', description: 'CFA - M&A precedent transaction analysis' },
      { name: 'Portfolio Analytics', description: 'CFA - Portfolio performance and risk analytics' },
      { name: 'Segment Reporting', description: 'IFRS 8 / ASC 280 - Operating segment disclosure' },
      { name: 'Audit', description: 'Audit procedures - DRL, PBC, sampling' },
      { name: 'Revenue Recognition', description: 'ASC 606 / IFRS 15 - Revenue recognition' },
      { name: 'Month-End Close', description: 'Month-end close procedures and checklists' },
      { name: 'Trial Balance', description: 'Trial balance and financial statement generation' },
    ],
  });

  return openAPISpec;
}

// Main execution
if (require.main === module) {
  const spec = generateOpenAPISpec();
  const outputPath = path.join(__dirname, '../docs/openapi.json');
  
  fs.writeFileSync(outputPath, JSON.stringify(spec, null, 2));
  console.log(`✅ OpenAPI spec generated: ${outputPath}`);
  console.log(`📄 Total routes: ${Object.keys(spec.paths || {}).length}`);
  console.log(`📦 Total schemas: ${Object.keys(spec.components?.schemas || {}).length}`);
  console.log(`\n🚀 To view the documentation:`);
  console.log(`   1. Start the API server`);
  console.log(`   2. Visit http://localhost:3000/api-docs`);
}

export default generateOpenAPISpec;
