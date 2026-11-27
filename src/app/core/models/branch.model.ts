export type BranchType = 'branch' | 'business-centre';

export type ServiceCode =
  | 'atm' // ATM on site
  | 'cash-deposit'
  | 'card-replacement'
  | 'business'
  | 'forex'
  | 'wheelchair';

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** 24h "HH:mm", local SA time (Africa/Johannesburg). close > open, no overnight periods. */
export interface OpeningPeriod {
  open: string;
  close: string;
}

/** Empty array = closed that day. More than one period = split day (e.g. lunch closure). */
export type WeeklyHours = Record<DayKey, OpeningPeriod[]>;

export type SpecialHoursReason =
  'public-holiday' | 'maintenance' | 'staff-training' | 'community-event' | 'other';

/** Replaces the weekly hours for one date or a date range. */
export interface SpecialHours {
  from: string; // ISO date "YYYY-MM-DD"
  to: string; // inclusive; same as `from` for a single day
  label: string; // "Day of Reconciliation", "Systems upgrade"
  reason: SpecialHoursReason;
  periods: OpeningPeriod[]; // [] = closed
}

/** Branch-level status that overrides hours entirely. */
export type BranchStatus =
  | { kind: 'operational' }
  | { kind: 'temporarily-closed'; reason: string; until: string } // reopens the day after `until`
  | { kind: 'relocated'; movedToId: string; since: string }
  | { kind: 'opening-soon'; opensOn: string };

export interface Address {
  street: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
}

export interface DataSource {
  dataset: 'AllThePlaces' | 'Microsoft' | 'meta' | 'Foursquare';
  overtureId: string;
  recordId?: string;
  updated: string; // ISO date of the source record
}

export interface Branch {
  id: string; // Overture GERS id (UUID), stable across releases
  name: string; // "Capitec Bank Paarl Mall"
  type: BranchType;
  location: { lat: number; lng: number };
  address: Address;
  phone?: string; // national call centre number
  services: ServiceCode[]; // invented
  hours: WeeklyHours; // invented
  specialHours: SpecialHours[]; // public holidays + scenarios
  status: BranchStatus;
  sources: DataSource[]; // every source that contributed to this record
}
