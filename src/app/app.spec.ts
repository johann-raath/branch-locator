import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, assert, describe, it, vi } from 'vitest';
import { App } from './app';
import { BranchRepository } from './core/data/branch-repository';
import { HttpBranchRepository } from './core/data/http-branch-repository';
import { BranchStore } from './core/state/branch-store';
import { Clock, FixedClock } from './core/services/clock';
import { at, makeBranch } from './core/testing/fixtures';

describe('BranchStore', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Clock, useValue: new FixedClock(at('2026-11-25T10:00'), false) },
        { provide: BranchRepository, useClass: HttpBranchRepository },
      ],
    });
    const store = TestBed.inject(BranchStore);
    const http = TestBed.inject(HttpTestingController);
    return { store, http };
  }

  it('loads, filters and sorts', () => {
    const { store, http } = setup();
    assert.equal(store.status(), 'loading');
    http
      .expectOne('/api/branches.json')
      .flush([
        makeBranch({ id: 'a', name: 'Capitec Bank Paarl Mall', services: ['atm', 'forex'] }),
        makeBranch({ id: 'b', name: 'Capitec Bank Bellville', services: ['atm'] }),
      ]);
    http.expectOne('/api/notices.json').flush([]);
    assert.equal(store.status(), 'ready');
    assert.deepEqual(
      store.results().map((r) => r.branch.id),
      ['b', 'a'],
    ); // A to Z

    store.toggleService('forex');
    assert.deepEqual(
      store.matched().map((b) => b.id),
      ['a'],
    );
    store.resetFilters();
    store.text.set('bellville');
    assert.deepEqual(
      store.matched().map((b) => b.id),
      ['b'],
    );
  });

  it('suggests matching branches A to Z only once the user has typed', () => {
    const { store, http } = setup();
    http.expectOne('/api/branches.json').flush([
      makeBranch({ id: 'a', name: 'Capitec Bank Paarl Mall' }),
      makeBranch({ id: 'b', name: 'Capitec Bank Paarl' }),
      makeBranch({
        id: 'c',
        name: 'Capitec Bank Bellville',
        address: {
          street: '2 Voortrekker Road',
          suburb: 'Bellville',
          city: 'Bellville',
          province: 'Western Cape',
          postalCode: '7530',
        },
      }),
    ]);
    http.expectOne('/api/notices.json').flush([]);
    assert.deepEqual(store.suggestions(), []);
    store.text.set('paarl');
    assert.deepEqual(
      store.suggestions().map((b) => b.id),
      ['b', 'a'],
    );
  });

  it('evaluates the open filter at the chosen visit time, in SAST', () => {
    const { store } = setup();
    assert.equal(store.asOf().toISOString(), '2026-11-25T08:00:00.000Z'); // now (10:00 SAST)
    store.setVisit({ time: '09:30' }, { date: '2026-11-28', time: '12:00' });
    assert.isTrue(store.openOn());
    assert.equal(store.asOf().toISOString(), '2026-11-28T07:30:00.000Z');
    store.clearOpenFilter();
    assert.isFalse(store.openOn());
    assert.isNull(store.visit());
  });

  it('keeps the popup selection when the detail panel closes', () => {
    const { store } = setup();
    store.showDetail('x');
    assert.equal(store.selectedId(), 'x');
    assert.equal(store.detailId(), 'x');
    store.closeDetail();
    assert.equal(store.selectedId(), 'x');
    assert.isNull(store.detailId());
  });

  describe('near me', () => {
    const addr = (c: string) => ({
      street: 'x',
      suburb: c,
      city: c,
      province: 'Western Cape',
      postalCode: '0000',
    });

    function load() {
      const { store, http } = setup();
      http.expectOne('/api/branches.json').flush([
        makeBranch({
          id: 'paarl',
          name: 'Capitec Bank Paarl',
          address: addr('Paarl'),
          location: { lat: -33.7342, lng: 18.9621 },
        }),
        makeBranch({
          id: 'paarl2',
          name: 'Capitec Bank Paarl Mall',
          address: addr('Paarl'),
          location: { lat: -33.7, lng: 18.99 },
        }),
      ]);
      http.expectOne('/api/notices.json').flush([]);
      return store;
    }

    /** Stubs navigator.geolocation; `result` is a position or an error code. */
    function geolocation(result: { lat: number; lng: number } | { code: number }) {
      const getCurrentPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => {
        if ('code' in result) fail(result as GeolocationPositionError);
        else ok({ coords: { latitude: result.lat, longitude: result.lng } } as GeolocationPosition);
      });
      vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
      return getCurrentPosition;
    }

    afterEach(() => vi.unstubAllGlobals());

    it('focuses the nearest branch within the radius', () => {
      const store = load();
      geolocation({ lat: -33.74, lng: 18.96 });
      store.locate();
      assert.equal(store.locateStatus(), 'idle');
      assert.equal(store.area()?.name, 'Near me');
      assert.equal(store.selectedId(), 'paarl');
    });

    it('moves to the nearest branch that matches when a filter changes', () => {
      const { store, http } = setup();
      http
        .expectOne('/api/branches.json')
        .flush([
          makeBranch({ id: 'near', location: { lat: -33.74, lng: 18.96 }, services: ['atm'] }),
          makeBranch({ id: 'next', location: { lat: -33.7, lng: 18.99 }, services: ['forex'] }),
        ]);
      http.expectOne('/api/notices.json').flush([]);
      geolocation({ lat: -33.74, lng: 18.96 });
      store.locate();
      TestBed.tick();
      assert.equal(store.selectedId(), 'near');

      store.toggleService('forex');
      TestBed.tick();
      assert.equal(store.selectedId(), 'next');
      assert.equal(store.area()?.name, 'Near me');

      store.toggleService('forex');
      TestBed.tick();
      assert.equal(store.selectedId(), 'near');
    });

    it('leaves a place search alone when a filter changes', () => {
      const store = load();
      store.setArea({ id: 'paarl', name: 'Paarl', location: { lat: -33.74, lng: 18.96 } });
      TestBed.tick();
      store.openOn.set(true);
      TestBed.tick();
      assert.isNull(store.selectedId());
    });

    it('says so, without asking the browser, when the page is not a secure context', () => {
      const store = load();
      const spy = geolocation({ lat: 0, lng: 0 });
      vi.stubGlobal('isSecureContext', false);
      store.locate();
      assert.equal(store.locateStatus(), 'insecure');
      assert.equal(spy.mock.calls.length, 0);
    });

    it('tells denied, timed out and unavailable apart', () => {
      const store = load();
      for (const [code, status] of [
        [1, 'denied'],
        [3, 'timeout'],
        [2, 'unavailable'],
      ] as const) {
        geolocation({ code });
        store.locate();
        assert.equal(store.locateStatus(), status);
      }
    });

    it('is unavailable when the browser has no geolocation', () => {
      const store = load();
      vi.stubGlobal('navigator', {});
      store.locate();
      assert.equal(store.locateStatus(), 'unavailable');
    });

    it('shows the closest branch and its distance when the user is far from every branch', () => {
      const store = load();
      geolocation({ lat: 51.5, lng: -0.12 }); // London
      store.locate();
      assert.equal(store.locateStatus(), 'far');
      assert.isAbove(store.farKm(), 9000);
      assert.isNull(store.area());
      assert.isNotNull(store.selectedId());
    });

    it('drops the message when the user searches instead', () => {
      const store = load();
      geolocation({ code: 1 });
      store.locate();
      assert.equal(store.locateStatus(), 'denied');
      store.setText('paarl');
      assert.equal(store.locateStatus(), 'idle');
    });
  });

  it('opens the details straight away on desktop, but not on smaller screens', () => {
    const { store } = setup();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    store.pick('x');
    assert.equal(store.selectedId(), 'x');
    assert.isNull(store.detailId());
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    store.pick('y');
    assert.equal(store.detailId(), 'y');
    vi.unstubAllGlobals();
  });

  describe('searching around an area', () => {
    const addr = (suburb: string, city: string) => ({
      street: 'x',
      suburb,
      city,
      province: 'Western Cape',
      postalCode: '0000',
    });
    const paarl = { lat: -33.7342, lng: 18.9621 };

    function load() {
      const { store, http } = setup();
      http.expectOne('/api/branches.json').flush([
        makeBranch({
          id: 'near',
          name: 'Capitec Bank Paarl',
          address: addr('Paarl', 'Paarl'),
          location: paarl,
        }),
        makeBranch({
          id: 'mid',
          name: 'Capitec Bank Bellville',
          address: addr('Bellville', 'Bellville'),
          location: { lat: -33.9, lng: 18.63 },
        }), // ~36 km
        makeBranch({
          id: 'far',
          name: 'Capitec Bank George',
          address: addr('George', 'George'),
          location: { lat: -33.96, lng: 22.46 },
        }), // far
      ]);
      http.expectOne('/api/notices.json').flush([]);
      return store;
    }

    it('offers places in the suggestions', () => {
      const store = load();
      store.setText('paar');
      assert.deepEqual(
        store.placeSuggestions().map((p) => p.name),
        ['Paarl'],
      );
    });

    it('limits results to the radius around the chosen place and sorts nearest first', () => {
      const store = load();
      store.setArea({ id: 'p', name: 'Paarl', location: paarl });
      assert.deepEqual(
        store.matched().map((b) => b.id),
        ['near'],
      );
      store.radiusKm.set(50);
      assert.deepEqual(
        store.results().map((r) => r.branch.id),
        ['near', 'mid'],
      );
    });

    it('widens the radius on its own when nothing is in range', () => {
      const store = load();
      store.setArea({ id: 'x', name: 'Stellenbosch', location: { lat: -33.93, lng: 18.86 } }); // nearest is ~20 km away
      assert.equal(store.radiusKm(), 30);
      assert.isAbove(store.matched().length, 0);
    });

    it('typing is a name search again and drops the area', () => {
      const store = load();
      store.setArea({ id: 'p', name: 'Paarl', location: paarl });
      assert.isTrue(store.radiusActive());
      store.setText('george');
      assert.isFalse(store.radiusActive());
      assert.deepEqual(
        store.matched().map((b) => b.id),
        ['far'],
      );
    });

    it('widen() steps through 15, 30 and 50 km and stops', () => {
      const store = load();
      store.radiusKm.set(15);
      store.widen();
      assert.equal(store.radiusKm(), 30);
      store.widen();
      assert.equal(store.radiusKm(), 50);
      assert.isNull(store.nextRadius());
      store.widen();
      assert.equal(store.radiusKm(), 50);
    });

    it('reset clears the area and the radius', () => {
      const store = load();
      store.setArea({ id: 'p', name: 'Paarl', location: paarl });
      store.radiusKm.set(50);
      store.resetFilters();
      assert.isNull(store.area());
      assert.equal(store.radiusKm(), 15);
      assert.lengthOf(store.matched(), 3);
    });
  });

  it('shows an error state and can retry', () => {
    const { store, http } = setup();
    http.expectOne('/api/notices.json').flush([]);
    http.expectOne('/api/branches.json').error(new ProgressEvent('error'));
    http.expectOne('/api/branches.json').error(new ProgressEvent('error'));
    assert.equal(store.status(), 'error');
    store.load();
    http.expectOne('/api/branches.json').flush([makeBranch()]);
    http.expectOne('/api/notices.json').flush([]);
    assert.equal(store.status(), 'ready');
  });
});

describe('App', () => {
  it('has a component class', () => assert.isFunction(App));
});
