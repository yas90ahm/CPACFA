'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { GenUIChat, type GenUIStructuredContent } from '@/components/genui-chat';
import { justifyQuestion } from '@/lib/api';

// Sample structured responses for demo (backend can return these when orchestrator/agent supports it)
const SAMPLE_BALANCE_SHEET: GenUIStructuredContent = {
  balance_sheet: {
    report_date: '2024-12-31',
    assets: [
      { label: 'Cash and equivalents', amount: 125000, accountCode: '1000' },
      { label: 'Accounts receivable', amount: 84000, accountCode: '1100' },
      { label: 'Inventory', amount: 62000, accountCode: '1200' },
      { label: 'Prepaid expenses', amount: 8000, accountCode: '1300' },
      { label: 'Property, plant & equipment', amount: 210000, accountCode: '1500' },
    ],
    liabilities: [
      { label: 'Accounts payable', amount: 45000, accountCode: '2000' },
      { label: 'Accrued expenses', amount: 22000, accountCode: '2100' },
      { label: 'Current portion of debt', amount: 30000, accountCode: '2200' },
      { label: 'Long-term debt', amount: 95000, accountCode: '2500' },
    ],
    equity: [
      { label: 'Common stock', amount: 100000, accountCode: '3000' },
      { label: 'Retained earnings', amount: 142000, accountCode: '3200' },
    ],
    total_assets: 489000,
    total_liabilities: 192000,
    total_equity: 242000,
  },
};

const SAMPLE_PNL: GenUIStructuredContent = {
  profit_and_loss: {
    report_date: '2024-12-31',
    revenue: [
      { label: 'Product revenue', amount: 520000, accountCode: '4000' },
      { label: 'Service revenue', amount: 180000, accountCode: '4100' },
    ],
    expenses: [
      { label: 'Cost of goods sold', amount: 280000, accountCode: '5000' },
      { label: 'Operating expenses', amount: 195000, accountCode: '6000' },
      { label: 'Interest expense', amount: 8000, accountCode: '6100' },
    ],
    total_revenue: 700000,
    total_expenses: 483000,
    net_income: 217000,
  },
};

const SAMPLE_CHART: GenUIStructuredContent = {
  chartData: [
    { period: 'Q1', revenue: 160000, operating_margin: 12 },
    { period: 'Q2', revenue: 168000, operating_margin: 13 },
    { period: 'Q3', revenue: 175000, operating_margin: 14 },
    { period: 'Q4', revenue: 197000, operating_margin: 15 },
  ],
  chartTitle: 'Revenue vs. Operating Margin',
  chartType: 'line',
};

const SUGGESTED_ACTIONS = [
  { label: 'Show me the balance sheet', query: 'Show me the balance sheet' },
  { label: 'P&L', query: 'P&L' },
  { label: 'Revenue vs operating margin trend', query: 'Revenue vs operating margin trend' },
];

export default function GenUIPage() {
  const handleSendMessage = React.useCallback(
    async (message: string): Promise<{ content: string | GenUIStructuredContent; state?: 'idle' | 'thinking' | 'writing_code' | 'checking_compliance' }> => {
      const q = message.toLowerCase().trim();
      // Demo: return structured JSON when user asks for balance sheet, P&L, or trends
      if (q.includes('balance sheet')) {
        return { content: SAMPLE_BALANCE_SHEET, state: 'idle' };
      }
      if (q.includes('p&l') || q.includes('profit') || q.includes('income statement') || q.includes('revenue and expenses')) {
        return { content: SAMPLE_PNL, state: 'idle' };
      }
      if (q.includes('trend') || q.includes('chart') || q.includes('revenue vs') || q.includes('operating margin')) {
        return { content: SAMPLE_CHART, state: 'idle' };
      }
      // Otherwise call justification API (or future orchestrator)
      try {
        const res = await justifyQuestion(message);
        // state can be set by backend; here we use idle after response
        const content = res.citation
          ? `${res.citation}\n\n${res.explanation ?? ''}`
          : (res.explanation ?? '');
        return { content, state: 'idle' };
      } catch (err) {
        return {
          content: err instanceof Error ? err.message : 'Request failed.',
          state: 'idle',
        };
      }
    },
    []
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">GenUI Chat</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Structured tables, clickable numbers, Chart Agent, and bot state (Thinking / Writing Code / Checking Compliance)
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <GenUIChat
          onSendMessage={handleSendMessage}
          contextLabel="Dashboard"
          suggestedActions={SUGGESTED_ACTIONS}
        />
        <p className="mt-4 text-xs text-muted-foreground max-w-2xl">
          Try: &quot;Show me the balance sheet&quot;, &quot;P&amp;L&quot;, or &quot;Revenue vs operating margin trend&quot; for structured tables and charts.
          Click any amount in a table to ask: &quot;Explain the source transactions for this $X amount.&quot;
        </p>
      </main>
    </div>
  );
}
