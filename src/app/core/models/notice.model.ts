/**
 * Date-relative notices served from /api/notices.json. Offsets are whole days relative to "today"
 * (Africa/Johannesburg, from the app's Clock). The HTTP repository resolves them to absolute dates
 * and merges them into `Branch.status` / `Branch.specialHours`, so the domain logic only sees absolute dates.
 */
interface NoticeBase {
  branchId: string;
  /** First affected day, as an offset from today (0 = today). */
  fromOffsetDays: number;
  /** Last affected day, inclusive. */
  toOffsetDays: number;
}

/** -> status { kind: 'temporarily-closed', reason, until: today + toOffsetDays } */
export interface TemporarilyClosedNotice extends NoticeBase {
  kind: 'temporarily-closed';
  reason: string;
}

/** -> specialHours entry for each day in range where the branch is normally open; weekly periods are clipped at `closeAt`. */
export interface CloseEarlyNotice extends NoticeBase {
  kind: 'close-early';
  label: string;
  reason: 'community-event' | 'maintenance' | 'staff-training' | 'other';
  closeAt: string; // "HH:mm"
}

/** -> status { kind: 'opening-soon', opensOn: today + fromOffsetDays } (toOffsetDays equals fromOffsetDays) */
export interface OpeningSoonNotice extends NoticeBase {
  kind: 'opening-soon';
}

export type Notice = TemporarilyClosedNotice | CloseEarlyNotice | OpeningSoonNotice;
