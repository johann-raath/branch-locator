import { assert, describe, it } from 'vitest';
import { moveIndex } from './list-nav';

describe('moveIndex', () => {
  it('highlights nothing in an empty list', () => {
    assert.equal(moveIndex(-1, 1, 0), -1);
    assert.equal(moveIndex(3, -1, 0), -1);
  });

  it('down from nothing goes to the first row, up from nothing to the last', () => {
    assert.equal(moveIndex(-1, 1, 5), 0);
    assert.equal(moveIndex(-1, -1, 5), 4);
  });

  it('moves one row at a time', () => {
    assert.equal(moveIndex(1, 1, 5), 2);
    assert.equal(moveIndex(2, -1, 5), 1);
  });

  it('wraps at both ends', () => {
    assert.equal(moveIndex(4, 1, 5), 0);
    assert.equal(moveIndex(0, -1, 5), 4);
  });

  it('a single row stays put', () => {
    assert.equal(moveIndex(0, 1, 1), 0);
    assert.equal(moveIndex(0, -1, 1), 0);
  });
});
