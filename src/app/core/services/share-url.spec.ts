import { assert, describe, it } from 'vitest';
import { readShare, ShareState, writeShare } from './share-url';

describe('share URLs', () => {
  const full: ShareState = {
    place: 'paarl|western cape',
    radius: 30,
    services: ['atm', 'wheelchair'],
    open: { date: '2026-11-28', time: '10:30' },
    branch: 'abc',
  };

  it('round-trips', () => {
    assert.deepEqual(readShare(writeShare(full)), full);
    assert.deepEqual(readShare(writeShare({ q: 'mall road', open: 'now' })), {
      q: 'mall road',
      open: 'now',
    });
  });

  it('stays readable', () => {
    assert.equal(
      writeShare(full),
      '?place=paarl~western+cape&r=30&s=atm,wheelchair&open=2026-11-28T10:30&branch=abc',
    );
  });

  it('keeps unrelated parameters and replaces its own', () => {
    assert.equal(
      writeShare({ q: 'b' }, '?now=2026-11-26T10:00&q=a&branch=x'),
      '?now=2026-11-26T10:00&q=b',
    );
    assert.equal(writeShare({}, '?q=a'), '');
  });

  it('drops anything it does not recognise', () => {
    assert.deepEqual(readShare('?s=atm,parking&open=tomorrow&r=-1&q=%20'), { services: ['atm'] });
  });

  it('only carries a radius together with a place', () => {
    assert.equal(writeShare({ radius: 50 }), '');
  });
});
