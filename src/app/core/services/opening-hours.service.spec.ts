import { assert, describe, it } from 'vitest';
import { Branch } from '../models/branch.model';
import { at, makeBranch, p, standardHours, week } from '../testing/fixtures';
import {
  findNextOpening,
  getOpeningState,
  isOpenNow,
  stateLabel,
  visitLabel,
} from './opening-hours.service';

// Calendar: Mon 23 Nov 2026 ... Fri 27, Sat 28, Sun 29, Mon 30. Wed 16 Dec 2026 = Day of Reconciliation.
const label = (b: Branch, when: string) => stateLabel(getOpeningState(b, at(when))).text;

describe('planned visit wording', () => {
  const planned = (when: string, today = '2026-11-23') =>
    visitLabel(getOpeningState(makeBranch(), at(when)), when.slice(11), today);

  it('names the chosen day and time', () => {
    assert.deepEqual(planned('2026-11-23T12:00'), {
      text: 'This branch will be open today at 12:00',
      tone: 'planned',
    });
    assert.equal(planned('2026-11-24T09:00').text, 'This branch will be open tomorrow at 09:00');
    assert.equal(
      planned('2026-11-28T10:00').text,
      'This branch will be open on Saturday 28 Nov at 10:00',
    );
  });
  it('says so when the branch will be closed then', () => {
    assert.deepEqual(planned('2026-11-29T10:00'), {
      text: 'This branch will be closed on Sunday 29 Nov at 10:00',
      tone: 'closed',
    });
  });
});

describe('weekly hours', () => {
  const b = makeBranch();
  it('before open', () => {
    const s = getOpeningState(b, at('2026-11-23T07:00'));
    assert.isFalse(s.isOpen);
    assert.equal(s.opensAt, '08:00');
    assert.equal(s.opensInMinutes, 60);
  });
  it('during', () => {
    const s = getOpeningState(b, at('2026-11-23T12:00'));
    assert.isTrue(s.isOpen);
    assert.equal(s.closesAt, '17:00');
    assert.equal(s.closesInMinutes, 300);
  });
  it('open at the opening minute, closed at the closing minute', () => {
    assert.isTrue(isOpenNow(b, at('2026-11-23T08:00')));
    assert.isFalse(isOpenNow(b, at('2026-11-23T17:00')));
  });
  it('after close points at tomorrow', () => {
    assert.equal(label(b, '2026-11-23T18:00'), 'Closed until tomorrow 08:00');
  });
  it('closed day (Sunday) points at Monday', () => {
    assert.equal(label(b, '2026-11-29T10:00'), 'Closed until tomorrow 08:00');
    assert.equal(label(b, '2026-11-28T14:00'), 'Closed until Monday 08:00');
  });
});

describe('closing / opening soon thresholds', () => {
  const b = makeBranch();
  it('closes in under 30 minutes is a warning', () => {
    const s = getOpeningState(b, at('2026-11-23T16:35'));
    assert.isTrue(s.closingSoon);
    assert.equal(stateLabel(s).text, 'Closes in 25 min');
    assert.isFalse(getOpeningState(b, at('2026-11-23T16:25')).closingSoon);
  });
  it('opens in under 60 minutes', () => {
    assert.equal(label(b, '2026-11-23T07:35'), 'Opens in 25 min');
    assert.equal(label(b, '2026-11-23T06:30'), 'Closed · opens 08:00');
  });
});

describe('split day (lunch closure)', () => {
  const b = makeBranch({ hours: week([p('08:00', '13:00'), p('13:45', '17:00')]) });
  it('open before lunch, closed during, open after', () => {
    assert.isTrue(isOpenNow(b, at('2026-11-23T12:00')));
    assert.isFalse(isOpenNow(b, at('2026-11-23T13:10')));
    assert.isTrue(isOpenNow(b, at('2026-11-23T14:00')));
  });
  it('label', () => {
    assert.equal(label(b, '2026-11-23T13:10'), 'Closed for lunch, back at 13:45');
  });
  it('does not flag the morning gap as lunch', () => {
    assert.equal(label(b, '2026-11-23T06:00'), 'Closed · opens 08:00');
  });
});

describe('special hours', () => {
  const holiday = {
    from: '2026-12-16',
    to: '2026-12-16',
    label: 'Day of Reconciliation',
    reason: 'public-holiday' as const,
    periods: [],
  };
  it('closed holiday', () => {
    const b = makeBranch({ specialHours: [holiday] });
    assert.equal(label(b, '2026-12-16T10:00'), 'Closed today: Day of Reconciliation');
    assert.equal(label(b, '2026-12-17T07:00'), 'Closed · opens 08:00');
  });
  it('mall holiday hours', () => {
    const b = makeBranch({ specialHours: [{ ...holiday, periods: [p('09:00', '13:00')] }] });
    assert.equal(label(b, '2026-12-16T10:00'), 'Open today with holiday hours 09:00–13:00');
  });
  it('date range applies to every day in it', () => {
    const b = makeBranch({
      specialHours: [
        {
          from: '2026-11-24',
          to: '2026-11-26',
          label: 'Renovation',
          reason: 'maintenance',
          periods: [],
        },
      ],
    });
    for (const d of ['2026-11-24', '2026-11-25', '2026-11-26'])
      assert.isFalse(isOpenNow(b, at(`${d}T10:00`)), d);
    assert.isTrue(isOpenNow(b, at('2026-11-27T10:00')));
    assert.isTrue(isOpenNow(b, at('2026-11-23T10:00')));
  });
  it('staff training: later opening is labelled', () => {
    const b = makeBranch({
      specialHours: [
        {
          from: '2026-11-25',
          to: '2026-11-25',
          label: 'Staff training',
          reason: 'staff-training',
          periods: [p('09:30', '17:00')],
        },
      ],
    });
    assert.equal(label(b, '2026-11-25T08:15'), 'Opens at 09:30 today (staff training)');
  });
  it('closing early for an event', () => {
    const b = makeBranch({
      specialHours: [
        {
          from: '2026-11-25',
          to: '2026-11-25',
          label: 'Community event',
          reason: 'community-event',
          periods: [p('08:00', '14:00')],
        },
      ],
    });
    assert.equal(label(b, '2026-11-25T10:00'), 'Closing early today at 14:00');
    assert.equal(label(b, '2026-11-25T13:40'), 'Closes in 20 min');
  });
  it('Christmas Eve early close', () => {
    const b = makeBranch({
      specialHours: [
        {
          from: '2026-12-24',
          to: '2026-12-24',
          label: 'Christmas Eve',
          reason: 'other',
          periods: [p('08:00', '12:00')],
        },
      ],
    });
    assert.equal(label(b, '2026-12-24T09:00'), 'Closing early: Christmas Eve');
  });
  it('late trading night', () => {
    const b = makeBranch({ hours: { ...standardHours(), fri: [p('08:00', '21:00')] } });
    assert.equal(label(b, '2026-11-27T18:00'), 'Open late tonight until 21:00');
    assert.equal(label(b, '2026-11-26T12:00'), 'Open · closes 17:00');
  });
});

describe('precedence: status > specialHours > weekly', () => {
  const special = {
    from: '2026-11-25',
    to: '2026-11-27',
    label: 'x',
    reason: 'other' as const,
    periods: [p('00:00', '23:59')],
  };
  it('temporarily closed beats open special hours', () => {
    const b = makeBranch({
      specialHours: [special],
      status: { kind: 'temporarily-closed', reason: 'Systems upgrade', until: '2026-11-25' },
    });
    const s = getOpeningState(b, at('2026-11-25T10:00'));
    assert.equal(s.status, 'temporarily-closed');
    assert.isFalse(s.isOpen);
    assert.equal(stateLabel(s).text, 'Temporarily closed: Systems upgrade. Reopens Thursday');
  });
  it('reopens the day after `until`', () => {
    const b = makeBranch({
      status: { kind: 'temporarily-closed', reason: 'r', until: '2026-11-24' },
    });
    assert.isTrue(isOpenNow(b, at('2026-11-25T10:00')));
  });
  it('special hours beat weekly hours', () => {
    const b = makeBranch({ specialHours: [special] });
    assert.isTrue(isOpenNow(b, at('2026-11-26T23:00'))); // weekly would be closed
  });
  it('relocated is never open and has no next opening', () => {
    const b = makeBranch({ status: { kind: 'relocated', movedToId: 'b2', since: '2026-10-01' } });
    const s = getOpeningState(b, at('2026-11-25T10:00'));
    assert.equal(s.status, 'relocated');
    assert.equal(s.movedToId, 'b2');
    assert.equal(stateLabel(s).text, 'This branch has moved');
    assert.isUndefined(findNextOpening(b, '2026-11-25', 0));
  });
  it('opening soon is not open and shows the date; opens normally from that day', () => {
    const b = makeBranch({ status: { kind: 'opening-soon', opensOn: '2026-12-03' } });
    const s = getOpeningState(b, at('2026-11-25T10:00'));
    assert.isFalse(s.isOpen);
    assert.equal(stateLabel(s).text, 'Opening 3 Dec');
    assert.equal(s.next?.date, '2026-12-03');
    assert.isTrue(isOpenNow(b, at('2026-12-03T10:00')));
  });
});

describe('next opening', () => {
  it('across a weekend', () => {
    const n = findNextOpening(
      makeBranch({ hours: week([p('08:00', '16:30')]) }),
      '2026-11-27',
      17 * 60,
    )!;
    assert.deepEqual([n.date, n.time, n.dayName], ['2026-11-30', '08:00', 'Monday']);
  });
  it('across a weekend and a holiday (Fri evening, Monday closed)', () => {
    const holiday = {
      from: '2026-11-30',
      to: '2026-11-30',
      label: 'Holiday',
      reason: 'public-holiday' as const,
      periods: [],
    };
    const b = makeBranch({ hours: week([p('08:00', '16:30')]), specialHours: [holiday] });
    const n = findNextOpening(b, '2026-11-27', 17 * 60)!;
    assert.equal(n.date, '2026-12-01');
    assert.equal(
      stateLabel(getOpeningState(b, at('2026-11-27T18:00'))).text,
      'Closed until Tuesday 08:00',
    );
  });
  it('business centre closed all weekend', () => {
    const b = makeBranch({ type: 'business-centre', hours: week([p('08:00', '16:30')]) });
    assert.equal(label(b, '2026-11-28T10:00'), 'Closed until Monday 08:00');
  });
  it('temporary closure pushes the next opening past `until`', () => {
    const b = makeBranch({
      status: { kind: 'temporarily-closed', reason: 'r', until: '2026-11-26' },
    });
    assert.equal(getOpeningState(b, at('2026-11-24T10:00')).next?.date, '2026-11-27');
  });
  it('returns undefined if never open', () => {
    const b = makeBranch({ hours: week([]) });
    assert.isUndefined(findNextOpening(b, '2026-11-24', 0));
  });
});

describe('time zone', () => {
  const b = makeBranch();
  it("uses Africa/Johannesburg regardless of the instant's UTC date or the runner time zone", () => {
    // 14:30Z = 16:30 SAST Friday: open, closes in 30. (A browser in New York would read 09:30.)
    const s = getOpeningState(b, new Date('2026-11-27T14:30:00Z'));
    assert.isTrue(s.isOpen);
    assert.equal(s.closesInMinutes, 30);
    // 22:30Z on Friday is already Saturday 00:30 in SAST.
    const late = getOpeningState(b, new Date('2026-11-27T22:30:00Z'));
    assert.equal(late.today, '2026-11-28');
    assert.isFalse(late.isOpen);
    // 06:30Z = 08:30 SAST: open although a UTC reading says 06:30.
    assert.isTrue(isOpenNow(b, new Date('2026-11-23T06:30:00Z')));
  });
});
