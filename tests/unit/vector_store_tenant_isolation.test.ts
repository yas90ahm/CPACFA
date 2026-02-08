/**
 * Unit tests: Vector store tenant isolation.
 * A) Insert chunks for tenantA and tenantB.
 * B) Query tenantA must never return tenantB chunks.
 * C) Query tenantB must never return tenantA chunks.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  addChunk,
  addChunks,
  query,
  queryForPrecedent,
  listChunks,
  clearTenant,
  clearStore,
  resolveTenantId,
  DEFAULT_TENANT_ID,
} from '../../src/knowledge_base/vector_store/index.js';

const TENANT_A = 'tenant-vector-a';
const TENANT_B = 'tenant-vector-b';

describe('Vector store tenant isolation', () => {
  beforeEach(() => {
    clearStore();
  });

  it('A) Insert chunks for tenantA and tenantB', () => {
    const c1 = addChunk(TENANT_A, {
      text: 'Tenant A cash flow disclosure policy',
      documentTitle: 'Tenant A Handbook',
      pageNumber: 1,
      standardType: 'GAAP',
      levelOfAuthority: 'company_policy',
    });
    const c2 = addChunk(TENANT_B, {
      text: 'Tenant B revenue recognition policy',
      documentTitle: 'Tenant B Manual',
      pageNumber: 1,
      standardType: 'GAAP',
      levelOfAuthority: 'company_policy',
    });
    expect(c1.id).toBeDefined();
    expect(c2.id).toBeDefined();
    expect(c1.id).not.toBe(c2.id);
    expect(listChunks(TENANT_A).length).toBe(1);
    expect(listChunks(TENANT_B).length).toBe(1);
  });

  it('B) Query tenantA must never return tenantB chunks', () => {
    addChunk(TENANT_A, {
      text: 'Tenant A cash flow disclosure guidelines',
      documentTitle: 'Tenant A Handbook',
      pageNumber: 1,
      standardType: 'GAAP',
      levelOfAuthority: 'company_policy',
    });
    addChunk(TENANT_B, {
      text: 'Tenant B revenue recognition policy',
      documentTitle: 'Tenant B Manual',
      pageNumber: 1,
      standardType: 'GAAP',
      levelOfAuthority: 'company_policy',
    });

    const resultsA = query(TENANT_A, 'revenue recognition policy');
    expect(resultsA.length).toBe(0);
    expect(resultsA.every((c) => c.documentTitle === 'Tenant A Handbook')).toBe(true);

    const resultsA2 = query(TENANT_A, 'cash flow');
    expect(resultsA2.length).toBe(1);
    expect(resultsA2[0].documentTitle).toBe('Tenant A Handbook');
    expect(resultsA2[0].text).toContain('Tenant A');
  });

  it('C) Query tenantB must never return tenantA chunks', () => {
    addChunk(TENANT_A, {
      text: 'Tenant A cash flow disclosure policy',
      documentTitle: 'Tenant A Handbook',
      pageNumber: 1,
      standardType: 'GAAP',
      levelOfAuthority: 'company_policy',
    });
    addChunk(TENANT_B, {
      text: 'Tenant B revenue recognition policy',
      documentTitle: 'Tenant B Manual',
      pageNumber: 1,
      standardType: 'GAAP',
      levelOfAuthority: 'company_policy',
    });

    const resultsB = query(TENANT_B, 'cash flow disclosure');
    expect(resultsB.length).toBe(0);

    const resultsB2 = query(TENANT_B, 'revenue recognition');
    expect(resultsB2.length).toBe(1);
    expect(resultsB2[0].documentTitle).toBe('Tenant B Manual');
    expect(resultsB2[0].text).toContain('Tenant B');
  });

  it('clearTenant removes only that tenant chunks', () => {
    addChunk(TENANT_A, {
      text: 'A',
      documentTitle: 'A',
      pageNumber: 1,
      standardType: 'GAAP',
      levelOfAuthority: 'company_policy',
    });
    addChunk(TENANT_B, {
      text: 'B',
      documentTitle: 'B',
      pageNumber: 1,
      standardType: 'GAAP',
      levelOfAuthority: 'company_policy',
    });
    clearTenant(TENANT_A);
    expect(listChunks(TENANT_A).length).toBe(0);
    expect(listChunks(TENANT_B).length).toBe(1);
  });

  it('resolveTenantId returns __dev_default when absent in test env', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      expect(resolveTenantId(undefined)).toBe(DEFAULT_TENANT_ID);
      expect(resolveTenantId('')).toBe(DEFAULT_TENANT_ID);
      expect(resolveTenantId('my-tenant')).toBe('my-tenant');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('resolveTenantId throws in production when tenant absent', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => resolveTenantId(undefined)).toThrow('Vector store requires tenantId');
      expect(() => resolveTenantId('')).toThrow('Vector store requires tenantId');
      expect(resolveTenantId('my-tenant')).toBe('my-tenant');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
