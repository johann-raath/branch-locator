import { ServiceCode } from './branch.model';

/** Shown wherever invented data appears, so nobody takes it for real branch information. */
export const SAMPLE_DATA_NOTE =
  'Demo: opening hours, services and notices are sample data, not Capitec information.';

export const SERVICE_LABELS: Record<ServiceCode, string> = {
  atm: 'ATM',
  'cash-deposit': 'Cash deposit',
  'card-replacement': 'Card replacement',
  business: 'Business',
  forex: 'Forex',
  wheelchair: 'Wheelchair access',
};

/** Shown in the filter menu. Wheelchair access has its own toggle in the search bar. */
export const FILTER_SERVICES: ServiceCode[] = [
  'atm',
  'cash-deposit',
  'card-replacement',
  'business',
  'forex',
];
