import { assert, describe, it } from 'vitest';
import { makeBranch } from '../testing/fixtures';
import { buildResultList, LIST_LIMIT, ResultList, ResultListInput } from './result-list';

const paarl = { lat: -33.73, lng: 18.96 };
const near = makeBranch({ id: 'near', name: 'B near', location: { lat: -33.731, lng: 18.961 } });
const mid = makeBranch({ id: 'mid', name: 'A mid', location: { lat: -33.8, lng: 18.9 } });
const far = makeBranch({ id: 'far', name: 'C far', location: { lat: -26.2, lng: 28.0 } });

const view = {
  bounds: { south: -34, north: -33.5, west: 18.5, east: 19.2 },
  center: paarl,
  zoom: 11,
};

const input = (over: Partial<ResultListInput> = {}): ResultListInput => ({
  matched: [far, mid, near],
  area: null,
  radiusKm: 15,
  text: '',
  origin: null,
  view,
  ...over,
});

function asList(r: ResultList) {
  assert.equal(r.kind, 'list');
  return r as Extract<ResultList, { kind: 'list' }>;
}
const ids = (r: ResultList) => asList(r).rows.map((x) => x.branch.id);

describe('buildResultList', () => {
  it('prompts when zoomed out with nothing searched', () => {
    assert.equal(buildResultList(input({ view: { ...view, zoom: 6 } })).kind, 'prompt');
    assert.equal(buildResultList(input({ view: null })).kind, 'prompt');
  });

  it('lists what is in view once zoomed in, nearest the centre first, without distances', () => {
    const r = buildResultList(input());
    assert.deepEqual(ids(r), ['near', 'mid']);
    assert.equal(asList(r).title, '2 branches in this area');
    assert.isUndefined(asList(r).rows[0]!.distanceKm);
  });

  it('shows distances from the user in view mode when their location is known', () => {
    const r = asList(buildResultList(input({ origin: paarl })));
    assert.isBelow(r.rows[0]!.distanceKm!, 1);
  });

  it('around an area: nearest first with distances, whatever the zoom', () => {
    const area = { id: 'p', name: 'Paarl', location: paarl };
    const r = asList(
      buildResultList(input({ area, matched: [mid, near], view: { ...view, zoom: 5 } })),
    );
    assert.deepEqual(
      r.rows.map((x) => x.branch.id),
      ['near', 'mid'],
    );
    assert.equal(r.title, '2 branches within 15 km of Paarl');
    assert.isDefined(r.rows[1]!.distanceKm);
  });

  it('calls "near me" you', () => {
    const area = { id: 'me', name: 'Near me', location: paarl };
    const r = asList(buildResultList(input({ area, matched: [near] })));
    assert.equal(r.title, '1 branch within 15 km of you');
  });

  it('lists name matches A to Z while text is typed', () => {
    const r = buildResultList(input({ text: ' bank ', matched: [near, mid] }));
    assert.deepEqual(ids(r), ['mid', 'near']);
    assert.equal(asList(r).title, '2 branches matching “bank”');
  });

  it('caps long lists and says how many are hidden', () => {
    const many = Array.from({ length: LIST_LIMIT + 7 }, (_, i) => makeBranch({ id: `b${i}` }));
    const r = asList(buildResultList(input({ text: 'x', matched: many })));
    assert.lengthOf(r.rows, LIST_LIMIT);
    assert.equal(r.hidden, 7);
  });

  it('does not reorder the input', () => {
    const matched = [far, mid, near];
    buildResultList(input({ text: 'a', matched }));
    assert.deepEqual(
      matched.map((b) => b.id),
      ['far', 'mid', 'near'],
    );
  });
});
