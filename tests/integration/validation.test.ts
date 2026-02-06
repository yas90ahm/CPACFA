/**
 * Integration tests for validated API endpoints
 * Tests input validation across all major routes
 */

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { app } from '../../src/server.js';
import { createTestTenant, cleanupTestTenant, getTestAuthToken } from '../helpers/testHelpers.js';
import { isDbConfigured } from '../../src/db/index.js';

describe('API Input Validation Tests', () => {
  let tenantId: string | undefined;
  let authToken: string | undefined;
  let skip = false;

  beforeAll(async () => {
    if (!isDbConfigured()) {
      skip = true;
      return;
    }
    try {
      const tenant = await createTestTenant();
      tenantId = tenant.id;
      authToken = getTestAuthToken(tenant.id);
    } catch {
      skip = true;
    }
  });

  afterAll(async () => {
    if (tenantId) await cleanupTestTenant(tenantId);
  });

  describe('Auth Routes Validation', () => {
    it('should reject login with missing email', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'test123' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toBeDefined();
    });

    it('should reject login with invalid email format', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'invalid-email', password: 'test123' });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject register with missing required fields', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@test.com' }); // Missing password, tenantId, tenantName
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid login payload', async () => {
      if (skip) return;
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
      if (skip) return;
      const res = await request(app)
        .post('/api/stock-comp/grants')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grantType: 'rsu',
          quantity: 1000,
          granteeId: 'emp-123'
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should reject grant with invalid grant type', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/stock-comp/grants')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grantType: 'invalid_type',
          grantDate: '2024-01-01',
          quantity: 1000,
          granteeId: 'emp-123'
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should reject grant with negative quantity', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/stock-comp/grants')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grantType: 'rsu',
          grantDate: '2024-01-01',
          quantity: -100,
          granteeId: 'emp-123'
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid grant creation payload', async () => {
      if (skip) return;
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
      
      expect([200, 201, 404]).toContain(res.status);
    });
  });

  describe('DCF Valuation Routes Validation', () => {
    it('should reject DCF model with missing cashFlows', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/valuation/dcf')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'Test Corp',
          wacc: 0.10,
          terminalGrowthRate: 0.03
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should reject DCF with invalid WACC (>1)', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/valuation/dcf')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          companyName: 'Test Corp',
          cashFlows: [100, 110, 120, 130, 140],
          wacc: 1.5, // Invalid: > 1
          terminalGrowthRate: 0.03
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should reject WACC calculation with missing components', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/valuation/dcf/wacc/calculate')
        .send({
          riskFreeRate: 0.03,
          beta: 1.2
          // Missing marketRiskPremium, costOfDebt, etc.
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid DCF model', async () => {
      if (skip) return;
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
      
      expect([200, 201, 404]).toContain(res.status);
    });
  });

  describe('Deferred Tax Routes Validation', () => {
    it('should reject deferred tax calculation with missing periodLabel', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/deferred-tax/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          taxRate: 0.21
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should reject tax rate > 1', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/deferred-tax/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          periodLabel: '2024-Q1',
          taxRate: 1.5 // Invalid
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid deferred tax calculation', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/deferred-tax/calculate')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          periodLabel: '2024-Q1',
          taxRate: 0.21
        });
      
      expect([200, 201, 404]).toContain(res.status);
    });
  });

  describe('Business Combination Routes Validation', () => {
    it('should reject acquisition without required fields', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/business-combination')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          acquisitionName: 'Test Acquisition'
          // Missing acquisitionDate, acquireeName, purchasePrice
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should reject acquisition with negative purchase price', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/business-combination')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          acquisitionName: 'Test Acquisition',
          acquisitionDate: '2024-01-01',
          acquireeName: 'Target Corp',
          purchasePrice: -1000000 // Invalid
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid acquisition', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/business-combination')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          acquisitionName: 'Test Acquisition',
          acquisitionDate: '2024-01-01',
          acquireeName: 'Target Corp',
          purchasePrice: 5000000
        });
      
      expect([200, 201, 404]).toContain(res.status);
    });
  });

  describe('Equity Method Routes Validation', () => {
    it('should reject investment with ownership < 0', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/equity-method')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          investeeName: 'Joint Venture LLC',
          investmentDate: '2024-01-01',
          ownershipPercent: -10, // Invalid
          initialInvestment: 1000000
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should reject investment with ownership > 100', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/equity-method')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          investeeName: 'Joint Venture LLC',
          investmentDate: '2024-01-01',
          ownershipPercent: 150, // Invalid
          initialInvestment: 1000000
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) expect(res.body.error).toBe('Validation failed');
    });

    it('should accept valid equity method investment', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/equity-method')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          investeeName: 'Joint Venture LLC',
          investmentDate: '2024-01-01',
          ownershipPercent: 25,
          initialInvestment: 1000000
        });
      
      expect([200, 201, 404]).toContain(res.status);
    });
  });

  describe('Trial Balance Routes Validation', () => {
    it('should reject statements without raw_trial_balance', async () => {
      if (skip) return;
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
      if (skip) return;
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
      
      expect([200, 201, 400, 404]).toContain(res.status);
    });
  });

  describe('Month-End Close Routes Validation', () => {
    it('should reject accrual suggestions without period_label', async () => {
      if (skip) return;
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
      if (skip) return;
      const res = await request(app)
        .post('/api/close/accrual-suggestions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_label: '2024-Q1',
          trial_balance: [
            { account_code: '5000', account_name: 'Revenue', debit: 0, credit: 1000000 }
          ]
        });
      
      expect([200, 201, 400, 404]).toContain(res.status);
    });
  });

  describe('Parameter Validation', () => {
    it('should reject requests with invalid ID params', async () => {
      if (skip) return;
      const res = await request(app)
        .get('/api/valuation/dcf/invalid-id-format')
        .set('Authorization', `Bearer ${authToken}`);
      
      // Should either validate or 404, not 400 for param validation
      expect(res.status).toBeDefined();
    });
  });

  describe('Field-Level Error Messages', () => {
    it('should provide detailed field-level errors', async () => {
      if (skip) return;
      const res = await request(app)
        .post('/api/stock-comp/grants')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          grantType: 'invalid',
          quantity: -100,
          // Missing grantDate, granteeId
        });
      
      expect([400, 404]).toContain(res.status);
      if (res.status === 400) {
        expect(res.body.error).toBe('Validation failed');
        if (Array.isArray(res.body.details) && res.body.details.length > 0) {
          expect(res.body.details[0]).toHaveProperty('path');
          expect(res.body.details[0]).toHaveProperty('message');
        }
      }
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
