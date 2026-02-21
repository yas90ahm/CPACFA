export interface GeneralSettings {
  entityName: string;
  fiscalYearEnd: string;
  baseCurrency: string;
  autoLockDays: number;
  varianceDollarThreshold: string;
  variancePercentThreshold: string;
}

export const mockGeneralSettings: GeneralSettings = {
  entityName: 'Apex Manufacturing Co.',
  fiscalYearEnd: 'December',
  baseCurrency: 'USD',
  autoLockDays: 7,
  varianceDollarThreshold: '50000.00',
  variancePercentThreshold: '10',
};

export function getGeneralSettings(_entityId: string): GeneralSettings {
  return { ...mockGeneralSettings };
}
