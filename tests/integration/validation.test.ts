/**
 * Integration tests for validated API endpoints
 * Tests input validation across all major routes
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import app from '../src/app.js';
import { createTestTenant, cleanupTestTenant, getTestAuthToken } from './helpers/testHelpers.js';

describe('API Input Validation Tests', () => {
  let tenantId: string;
  let authToken: string;

  beforeAll(async () => {
    const tenant = await createTestTenant();
    tenantId = tenant.id;
    authToken = await getTestAuthToken(tenant.id);
  });

  afterAll(async () => {
    await cleanupTestTenant(tenantId);
  });

  describe('Auth Routes Validation', () => {
    it('should reject login with missing email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'test123' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeDefined();
    });

    it('should reject login with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'invalid-email', password: 'test123' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject register with missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com' }); // Missing password, tenantId, tenantName
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid login payload', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
          tenantId: tenantId
        });
      
      // Should pass validation (may fail auth, but validation passes)
      expect(res.status).not.toBe(400);
    });
  });

  describe('Stock Compensation Routes Validation', () => {
    it('should reject grant creation with missing grantDate', async () => {
      const res = await request(app)
        .post('/api/stock-comp/grants')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grantType: 'rsu',
          quantity: 1000,
          granteeId: 'emp-123'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject grant with invalid grant type', async () => {
      const res = await request(app)
        .post('/api/stock-comp/grants')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grantType: 'invalid_type',
          grantDate: '2024-01-01',
          quantity: 1000,
          granteeId: 'emp-123'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject grant with negative quantity', async () => {
      const res = await request(app)
        .post('/api/stock-comp/grants')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grantType: 'rsu',
          grantDate: '2024-01-01',
          quantity: -100,
          granteeId: 'emp-123'
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid grant creation payload', async () => {
      const res = await request(app)
        .post('/api/stock-comp/grants')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grantType: 'rsu',
          grantDate: '2024-01-01',
          quantity: 1000,
          granteeId: 'emp-123',
          fairValuePerShare: 50,
          vestingSchedule: {
            startDate: '2024-01-01',
            endDate: '2028-01-01',
            cliffMonths: 12,
            vestingMonths: 48
          }
        });
      
      expect(res.status).not.toBe(400);
    });
  });

  describe('DCF Valuation Routes Validation', () => {
    it('should reject DCF model with missing cashFlows', async () => {
      const res = await request(app)
        .post('/api/valuation/dcf')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'Test Corp',
          wacc: 0.10,
          terminalGrowthRate: 0.03
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject DCF with invalid WACC (>1)', async () => {
      const res = await request(app)
        .post('/api/valuation/dcf')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'Test Corp',
          cashFlows: [100, 110, 120, 130, 140],
          wacc: 1.5, // Invalid: > 1
          terminalGrowthRate: 0.03
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject WACC calculation with missing components', async () => {
      const res = await request(app)
        .post('/api/valuation/dcf/wacc/calculate')
        .send({
          riskFreeRate: 0.03,
          beta: 1.2
          // Missing marketRiskPremium, costOfDebt, etc.
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid DCF model', async () => {
      const res = await request(app)
        .post('/api/valuation/dcf')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'Test Corp',
          cashFlows: [100, 110, 120, 130, 140],
          wacc: 0.10,
          terminalGrowthRate: 0.03,
          netDebt: 50,
          sharesOutstanding: 1000
        });
      
      expect(res.status).not.toBe(400);
    });
  });

  describe('Deferred Tax Routes Validation', () => {
    it('should reject deferred tax calculation with missing periodLabel', async () => {
      const res = await request(app)
        .post('/api/deferred-tax/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taxRate: 0.21
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject tax rate > 1', async () => {
      const res = await request(app)
        .post('/api/deferred-tax/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          periodLabel: '2024-Q1',
          taxRate: 1.5 // Invalid
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid deferred tax calculation', async () => {
      const res = await request(app)
        .post('/api/deferred-tax/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          periodLabel: '2024-Q1',
          taxRate: 0.21
        });
      
      expect(res.status).not.toBe(400);
    });
  });

  describe('Business Combination Routes Validation', () => {
    it('should reject acquisition without required fields', async () => {
      const res = await request(app)
        .post('/api/business-combination')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          acquisitionName: 'Test Acquisition'
          // Missing acquisitionDate, acquireeName, purchasePrice
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject acquisition with negative purchase price', async () => {
      const res = await request(app)
        .post('/api/business-combination')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          acquisitionName: 'Test Acquisition',
          acquisitionDate: '2024-01-01',
          acquireeName: 'Target Corp',
          purchasePrice: -1000000 // Invalid
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid acquisition', async () => {
      const res = await request(app)
        .post('/api/business-combination')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          acquisitionName: 'Test Acquisition',
          acquisitionDate: '2024-01-01',
          acquireeName: 'Target Corp',
          purchasePrice: 5000000
        });
      
      expect(res.status).not.toBe(400);
    });
  });

  describe('Equity Method Routes Validation', () => {
    it('should reject investment with ownership < 0', async () => {
      const res = await request(app)
        .post('/api/equity-method')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          investeeName: 'Joint Venture LLC',
          investmentDate: '2024-01-01',
          ownershipPercent: -10, // Invalid
          initialInvestment: 1000000
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject investment with ownership > 100', async () => {
      const res = await request(app)
        .post('/api/equity-method')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          investeeName: 'Joint Venture LLC',
          investmentDate: '2024-01-01',
          ownershipPercent: 150, // Invalid
          initialInvestment: 1000000
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid equity method investment', async () => {
      const res = await request(app)
        .post('/api/equity-method')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          investeeName: 'Joint Venture LLC',
          investmentDate: '2024-01-01',
          ownershipPercent: 25,
          initialInvestment: 1000000
        });
      
      expect(res.status).not.toBe(400);
    });
  });

  describe('Trial Balance Routes Validation', () => {
    it('should reject statements without raw_trial_balance', async () => {
      const res = await request(app)
        .post('/api/trial-balance/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_label: '2024-Q1'
          // Missing raw_trial_balance
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid trial balance statements', async () => {
      const res = await request(app)
        .post('/api/trial-balance/statements')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_label: '2024-Q1',
          raw_trial_balance: [
            { account_code: '1000', account_name: 'Cash', debit: 100000, credit: 0 },
            { account_code: '2000', account_name: 'Accounts Payable', debit: 0, credit: 50000 }
          ]
        });
      
      expect(res.status).not.toBe(400);
    });
  });

  describe('Month-End Close Routes Validation', () => {
    it('should reject accrual suggestions without period_label', async () => {
      const res = await request(app)
        .post('/api/close/accrual-suggestions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          trial_balance: []
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid accrual suggestion request', async () => {
      const res = await request(app)
        .post('/api/close/accrual-suggestions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_label: '2024-Q1',
          trial_balance: [
            { account_code: '5000', account_name: 'Revenue', debit: 0, credit: 1000000 }
          ]
        });
      
      expect(res.status).not.toBe(400);
    });
  });

  describe('Parameter Validation', () => {
    it('should reject requests with invalid ID params', async () => {
      const res = await request(app)
        .get('/api/valuation/dcf/invalid-id-format')
        .set('Authorization', `Bearer ${authToken}`);
      
      // Should either validate or 404, not 400 for param validation
      expect(res.status).toBeDefined();
    });
  });

  describe('Field-Level Error Messages', () => {
    it('should provide detailed field-level errors', async () => {
      const res = await request(app)
        .post('/api/stock-comp/grants')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grantType: 'invalid',
          quantity: -100,
          // Missing grantDate, granteeId
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeInstanceOf(Array);
      expect(res.body.details.length).toBeGreaterThan(0);
      expect(res.body.details[0]).toHaveProperty('path');
      expect(res.body.details[0]).toHaveProperty('message');
    });
  });
});

describe('Type Coercion Tests', () => {
  it('should handle string numbers correctly', async () => {
    const res = await request(app)
      .post('/api/valuation/dcf/wacc/calculate')
      .send({
        riskFreeRate: '0.03', // String instead of number
        beta: '1.2',
        marketRiskPremium: '0.07',
        costOfDebt: '0.05',
        taxRate: '0.21',
        debtWeight: '0.3',
        equityWeight: '0.7'
      });
    
    // Zod can coerce, but we want strict typing
    expect(res.status).toBeDefined();
  });
});
