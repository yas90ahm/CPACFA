'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Building2,
  FileSpreadsheet,
  Brain,
  Upload,
  ListChecks,
  FileText,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import {
  useOnboardingState,
  useAdvanceOnboarding,
  useSetEntityInfo,
  useImportCoA,
  useSuggestCoAMapping,
  useFirstCloseGuide,
  type OnboardingStepId,
  type CoAAccount,
  type CoAMappingSuggestion,
  type FirstCloseGuideStep,
} from '@/lib/queries/onboarding';
import { FileUploadZone } from '@/components/shared/FileUploadZone';

const STEP_CONFIG: Record<OnboardingStepId, { icon: typeof Building2; label: string; description: string }> = {
  welcome: { icon: Sparkles, label: 'Welcome', description: 'Get started with Sabit' },
  entity_info: { icon: Building2, label: 'Entity Setup', description: 'Configure your company' },
  coa_import: { icon: FileSpreadsheet, label: 'Chart of Accounts', description: 'Import your CoA' },
  first_tb: { icon: Upload, label: 'Trial Balance', description: 'Upload your first GL' },
  first_close_checklist: { icon: ListChecks, label: 'Close Guide', description: 'AI-generated checklist' },
  first_statements: { icon: FileText, label: 'Statements', description: 'Generate financials' },
  complete: { icon: CheckCircle2, label: 'Complete', description: 'Ready to go' },
};

const STEP_ORDER: OnboardingStepId[] = [
  'welcome', 'entity_info', 'coa_import', 'first_tb', 'first_close_checklist', 'first_statements', 'complete',
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF'];

// --- Welcome Step ---
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center max-w-lg mx-auto py-8">
      <div className="w-16 h-16 rounded-2xl bg-[#7C5CFC]/10 flex items-center justify-center mx-auto mb-6">
        <Sparkles className="w-8 h-8 text-[#7C5CFC]" />
      </div>
      <h2 className="text-2xl font-semibold text-white mb-3">Welcome to Sabit</h2>
      <p className="text-sm text-gray-400 mb-8 leading-relaxed">
        Sabit is your AI-native financial close engine. We&apos;ll walk you through setting up
        your entity, importing your chart of accounts, and running your first close cycle.
        The entire setup takes about 5 minutes.
      </p>
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { icon: Brain, label: 'AI-Powered', detail: 'Intelligent account mapping' },
          { icon: ListChecks, label: 'SOX-Ready', detail: 'Built-in controls testing' },
          { icon: FileText, label: 'Four Statements', detail: 'BS, IS, CF, SE automated' },
        ].map((f) => (
          <div key={f.label} className="bg-[#0d1017] border border-[#262C48] rounded-xl p-4">
            <f.icon className="w-5 h-5 text-[#7C5CFC] mb-2" />
            <p className="text-xs font-medium text-white">{f.label}</p>
            <p className="text-[10px] text-gray-600 mt-0.5">{f.detail}</p>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onNext}
        className="px-8 py-3 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] transition-colors inline-flex items-center gap-2"
      >
        Get Started <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- Entity Info Step ---
function EntityInfoStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [entityName, setEntityName] = useState('');
  const [fiscalYearEnd, setFiscalYearEnd] = useState('12-31');
  const [currency, setCurrency] = useState('USD');
  const setEntityInfo = useSetEntityInfo();

  const handleSubmit = () => {
    setEntityInfo.mutate({ entityName, fiscalYearEnd, currency }, { onSuccess: onNext });
  };

  return (
    <div className="max-w-md mx-auto py-6">
      <h2 className="text-xl font-semibold text-white mb-1">Entity Setup</h2>
      <p className="text-sm text-gray-500 mb-6">Tell us about your company</p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Entity Name</label>
          <input
            type="text"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            placeholder="Acme Holdings LLC"
            className="w-full px-4 py-2.5 rounded-lg bg-[#0d1017] border border-[#262C48] text-sm text-white placeholder:text-gray-700 focus:outline-none focus:border-[#7C5CFC]/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Fiscal Year End</label>
          <select
            value={fiscalYearEnd}
            onChange={(e) => setFiscalYearEnd(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-[#0d1017] border border-[#262C48] text-sm text-white focus:outline-none focus:border-[#7C5CFC]/50"
          >
            <option value="12-31">December 31</option>
            <option value="06-30">June 30</option>
            <option value="03-31">March 31</option>
            <option value="09-30">September 30</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Base Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-[#0d1017] border border-[#262C48] text-sm text-white focus:outline-none focus:border-[#7C5CFC]/50"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-between mt-8">
        <button type="button" onClick={onBack} className="px-4 py-2 rounded-lg border border-[#262C48] text-sm text-gray-400 hover:text-white hover:bg-[#1a1d2e] transition-colors inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!entityName.trim() || setEntityInfo.isPending}
          className="px-6 py-2 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] disabled:opacity-50 transition-colors inline-flex items-center gap-2"
        >
          {setEntityInfo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// --- CoA Import Step ---
function CoAImportStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [accounts, setAccounts] = useState<CoAAccount[]>([]);
  const [suggestions, setSuggestions] = useState<CoAMappingSuggestion[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const importCoA = useImportCoA();
  const suggestMapping = useSuggestCoAMapping();

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter((l) => l.trim());
        if (lines.length < 2) { setParseError('File must have at least a header and one row'); return; }
        const header = lines[0].toLowerCase();
        const codeIdx = header.split(',').findIndex((h) => h.trim().match(/code|number|acct/i));
        const nameIdx = header.split(',').findIndex((h) => h.trim().match(/name|description|label/i));
        if (codeIdx === -1 || nameIdx === -1) { setParseError('CSV must have columns for account code and name'); return; }

        const parsed: CoAAccount[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
          if (cols[codeIdx] && cols[nameIdx]) {
            parsed.push({ code: cols[codeIdx], name: cols[nameIdx] });
          }
        }
        setAccounts(parsed);
      } catch {
        setParseError('Failed to parse CSV file');
      }
    };
    reader.readAsText(file);
  }, []);

  const handleImport = () => {
    importCoA.mutate(accounts, {
      onSuccess: () => {
        // Also get AI suggestions
        suggestMapping.mutate(accounts.slice(0, 50), {
          onSuccess: (data) => setSuggestions(data.suggestions ?? []),
        });
      },
    });
  };

  const imported = importCoA.isSuccess;

  return (
    <div className="max-w-lg mx-auto py-6">
      <h2 className="text-xl font-semibold text-white mb-1">Chart of Accounts</h2>
      <p className="text-sm text-gray-500 mb-6">Import your chart of accounts from a CSV file</p>

      {!imported ? (
        <>
          <FileUploadZone
            onFile={handleFile}
            title="Drop your Chart of Accounts CSV"
            subtitle="or click to browse"
            hint="CSV with account code and name columns"
          />
          {parseError && (
            <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20 text-red-400 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" /> {parseError}
            </div>
          )}
          {accounts.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">{accounts.length} accounts parsed</p>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importCoA.isPending}
                  className="px-4 py-2 rounded-lg bg-[#7C5CFC] text-white text-xs font-medium hover:bg-[#6B4FE0] disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {importCoA.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                  Import & Map with AI
                </button>
              </div>
              <div className="bg-[#0d1017] border border-[#262C48] rounded-lg max-h-48 overflow-y-auto">
                {accounts.slice(0, 15).map((a, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs border-b border-[#1e2235] last:border-0">
                    <span className="font-mono text-gray-500 w-16 shrink-0">{a.code}</span>
                    <span className="text-gray-300 truncate">{a.name}</span>
                  </div>
                ))}
                {accounts.length > 15 && (
                  <div className="px-3 py-2 text-[10px] text-gray-600 text-center">+{accounts.length - 15} more</div>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 text-sm">
            <CheckCircle2 className="w-5 h-5" />
            <span>{accounts.length} accounts imported successfully</span>
          </div>
          {suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-[#7C5CFC]" />
                <p className="text-xs font-medium text-white">AI Classification Suggestions</p>
              </div>
              <div className="bg-[#0d1017] border border-[#262C48] rounded-lg max-h-48 overflow-y-auto">
                {suggestions.slice(0, 10).map((s, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs border-b border-[#1e2235] last:border-0">
                    <span className="font-mono text-gray-500 w-16 shrink-0">{s.accountCode}</span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase',
                      s.suggestedType === 'ASSET' && 'bg-sky-500/10 text-sky-400',
                      s.suggestedType === 'LIABILITY' && 'bg-rose-500/10 text-rose-400',
                      s.suggestedType === 'EQUITY' && 'bg-purple-500/10 text-purple-400',
                      s.suggestedType === 'REVENUE' && 'bg-emerald-500/10 text-emerald-400',
                      s.suggestedType === 'EXPENSE' && 'bg-amber-500/10 text-amber-400',
                    )}>{s.suggestedType}</span>
                    {s.reason && <span className="text-gray-600 truncate">{s.reason}</span>}
                  </div>
                ))}
              </div>
              {suggestMapping.isPending && (
                <div className="flex items-center gap-2 text-xs text-[#7C5CFC]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI is classifying accounts...
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between mt-8">
        <button type="button" onClick={onBack} className="px-4 py-2 rounded-lg border border-[#262C48] text-sm text-gray-400 hover:text-white hover:bg-[#1a1d2e] transition-colors inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!imported}
          className="px-6 py-2 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] disabled:opacity-50 transition-colors inline-flex items-center gap-2"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// --- First TB Step ---
function FirstTBStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  return (
    <div className="max-w-md mx-auto py-6">
      <h2 className="text-xl font-semibold text-white mb-1">Upload Trial Balance</h2>
      <p className="text-sm text-gray-500 mb-6">
        You can upload your first GL export now, or skip this step and do it when you create your first close session.
      </p>

      <div className="bg-[#0d1017] border border-[#262C48] rounded-xl p-6 text-center">
        <Upload className="w-8 h-8 text-gray-600 mx-auto mb-3" />
        <p className="text-sm text-gray-400 mb-1">GL upload happens during the close session</p>
        <p className="text-[10px] text-gray-600">Create a close session to begin importing GL data</p>
      </div>

      <div className="flex justify-between mt-8">
        <button type="button" onClick={onBack} className="px-4 py-2 rounded-lg border border-[#262C48] text-sm text-gray-400 hover:text-white hover:bg-[#1a1d2e] transition-colors inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="px-6 py-2 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] transition-colors inline-flex items-center gap-2"
        >
          Skip for Now <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// --- Close Guide Step ---
function CloseGuideStep({ onNext, onBack, entityName, fiscalYearEnd }: { onNext: () => void; onBack: () => void; entityName?: string; fiscalYearEnd?: string }) {
  const [guideSteps, setGuideSteps] = useState<FirstCloseGuideStep[]>([]);
  const getGuide = useFirstCloseGuide();

  const handleGenerate = () => {
    getGuide.mutate({ entityName, fiscalYearEnd }, {
      onSuccess: (data) => setGuideSteps(data.steps ?? []),
    });
  };

  return (
    <div className="max-w-lg mx-auto py-6">
      <h2 className="text-xl font-semibold text-white mb-1">First Close Guide</h2>
      <p className="text-sm text-gray-500 mb-6">AI generates a personalized close checklist for your entity</p>

      {guideSteps.length === 0 ? (
        <div className="text-center py-8">
          <Brain className="w-10 h-10 text-[#7C5CFC]/50 mx-auto mb-4" />
          <p className="text-sm text-gray-400 mb-4">Generate an AI-powered close workflow tailored to your entity</p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={getGuide.isPending}
            className="px-6 py-3 rounded-lg bg-[#7C5CFC]/10 text-[#7C5CFC] text-sm font-medium hover:bg-[#7C5CFC]/20 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {getGuide.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Generate Close Guide
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {guideSteps.map((step, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-[#262C48] bg-[#0d1017]">
              <div className="w-6 h-6 rounded-full bg-[#7C5CFC]/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-semibold text-[#7C5CFC]">{step.order}</span>
              </div>
              <div>
                <p className="text-xs font-medium text-white">{step.label}</p>
                {step.description && <p className="text-[10px] text-gray-500 mt-0.5">{step.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between mt-8">
        <button type="button" onClick={onBack} className="px-4 py-2 rounded-lg border border-[#262C48] text-sm text-gray-400 hover:text-white hover:bg-[#1a1d2e] transition-colors inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="px-6 py-2 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] transition-colors inline-flex items-center gap-2"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// --- Complete Step ---
function CompleteStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="text-center max-w-lg mx-auto py-8">
      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
      </div>
      <h2 className="text-2xl font-semibold text-white mb-3">Setup Complete</h2>
      <p className="text-sm text-gray-400 mb-8 leading-relaxed">
        Your entity is configured and ready for your first close. Create a close session
        to begin uploading GL data, mapping accounts, and generating financial statements.
      </p>
      <button
        type="button"
        onClick={onFinish}
        className="px-8 py-3 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] transition-colors inline-flex items-center gap-2"
      >
        Create First Close Session <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// --- Main Wizard ---
export function OnboardingWizard() {
  const router = useRouter();
  const { data: state, isLoading } = useOnboardingState();
  const advance = useAdvanceOnboarding();
  const [localStep, setLocalStep] = useState<OnboardingStepId | null>(null);

  const currentStep = localStep ?? state?.currentStep ?? 'welcome';
  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const completedSteps = state?.completedSteps ?? [];

  const goNext = useCallback(() => {
    const nextIdx = currentIdx + 1;
    if (nextIdx >= STEP_ORDER.length) return;
    const nextStep = STEP_ORDER[nextIdx];
    advance.mutate(currentStep);
    setLocalStep(nextStep);
  }, [currentIdx, currentStep, advance]);

  const goBack = useCallback(() => {
    const prevIdx = currentIdx - 1;
    if (prevIdx < 0) return;
    setLocalStep(STEP_ORDER[prevIdx]);
  }, [currentIdx]);

  const handleFinish = () => {
    advance.mutate('complete');
    router.push('/');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0d14] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#7C5CFC] animate-spin" />
      </div>
    );
  }

  if (state?.currentStep === 'complete' && !localStep) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0d14] flex flex-col">
      {/* Progress bar */}
      <div className="border-b border-[#1e2235] bg-[#0d1017]">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Setup Progress</span>
            <span className="text-[10px] text-gray-600 tabular-nums">Step {currentIdx + 1} of {STEP_ORDER.length}</span>
          </div>
          <div className="flex items-center gap-1">
            {STEP_ORDER.map((step, i) => {
              const isComplete = completedSteps.includes(step) || i < currentIdx;
              const isCurrent = step === currentStep;
              return (
                <div key={step} className="flex-1 flex items-center gap-1">
                  <div className={cn(
                    'h-1.5 flex-1 rounded-full transition-all',
                    isComplete ? 'bg-[#7C5CFC]' : isCurrent ? 'bg-[#7C5CFC]/50' : 'bg-[#1e2235]'
                  )} />
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2">
            {STEP_ORDER.map((step) => {
              const config = STEP_CONFIG[step];
              const isCurrent = step === currentStep;
              return (
                <span
                  key={step}
                  className={cn(
                    'text-[9px] font-medium transition-colors',
                    isCurrent ? 'text-[#7C5CFC]' : 'text-gray-700'
                  )}
                >
                  {config.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        {currentStep === 'welcome' && <WelcomeStep onNext={goNext} />}
        {currentStep === 'entity_info' && <EntityInfoStep onNext={goNext} onBack={goBack} />}
        {currentStep === 'coa_import' && <CoAImportStep onNext={goNext} onBack={goBack} />}
        {currentStep === 'first_tb' && <FirstTBStep onNext={goNext} onBack={goBack} />}
        {currentStep === 'first_close_checklist' && (
          <CloseGuideStep
            onNext={goNext}
            onBack={goBack}
            entityName={state?.entityInfo?.entityName}
            fiscalYearEnd={state?.entityInfo?.fiscalYearEnd}
          />
        )}
        {currentStep === 'first_statements' && (
          <div className="max-w-md mx-auto py-6">
            <h2 className="text-xl font-semibold text-white mb-1">Financial Statements</h2>
            <p className="text-sm text-gray-500 mb-6">
              Sabit generates four certified financial statements from your adjusted trial balance:
              Balance Sheet, Income Statement, Cash Flow Statement, and Statement of Stockholders&apos; Equity.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-8">
              {['Balance Sheet', 'Income Statement', 'Cash Flow', 'Stockholders\' Equity'].map((s) => (
                <div key={s} className="bg-[#0d1017] border border-[#262C48] rounded-xl p-4 flex items-center gap-3">
                  <FileText className="w-4 h-4 text-[#7C5CFC]" />
                  <span className="text-xs text-gray-300">{s}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between">
              <button type="button" onClick={goBack} className="px-4 py-2 rounded-lg border border-[#262C48] text-sm text-gray-400 hover:text-white hover:bg-[#1a1d2e] transition-colors inline-flex items-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
              <button type="button" onClick={goNext} className="px-6 py-2 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] transition-colors inline-flex items-center gap-2">
                Continue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {currentStep === 'complete' && <CompleteStep onFinish={handleFinish} />}
      </div>
    </div>
  );
}
