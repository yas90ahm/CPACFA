export interface ReadinessGate {
  id: string;
  name: string;
  description: string;
  passing: boolean;
  detail: string;
  category: 'hard' | 'soft';
  navigateTo: string;
}

export interface CloseReadiness {
  sessionId: string;
  gatesPassing: number;
  gatesTotal: number;
  canAdvance: boolean;
  gates: ReadinessGate[];
}
