import { assert, describe, it } from 'vitest';
import {
  classify,
  deriveName,
  isCapitecBankName,
  normaliseName,
  sharePlaceToken,
  slugToPlace,
} from './names.ts';

const base = 'https://capitecpages.localpages.io/';

describe('slugToPlace', () => {
  it('CamelCase with DNR', () => {
    assert.equal(
      slugToPlace(base + 'BankingFinance-CapeTown-CapitecBankDNRHoutBayCentre'),
      'Hout Bay Centre',
    );
  });
  it('CamelCase with consecutive capitals', () => {
    assert.equal(
      slugToPlace(base + 'BankingFinance-Gqeberha-CapitecBankDNRPESunridgeVillage'),
      'PE Sunridge Village',
    );
  });
  it('CamelCase without DNR', () => {
    assert.equal(slugToPlace(base + 'BankingFinance-Citrusdal-CapitecBankCitrusdal'), 'Citrusdal');
  });
  it('business centre', () => {
    assert.equal(slugToPlace(base + 'BankingFinance-Paarl-CapitecBusinessCentrePaarl'), 'Paarl');
  });
  it('kebab case', () => {
    assert.equal(
      slugToPlace(base + 'banking-finance-southside-centre-capitec-bank-dnr-strand-southside'),
      'Strand Southside',
    );
  });
  it('kebab case with apostrophe-less place', () => {
    assert.equal(
      slugToPlace(base + 'banking-finance-cape-town-capitec-bank-dnr-gordons-bay-bay-crescent'),
      'Gordons Bay Bay Crescent',
    );
  });
  it('returns undefined for non-slug urls', () => {
    assert.equal(slugToPlace('https://www.capitecbank.co.za/branch-locator/'), undefined);
    assert.equal(slugToPlace(undefined), undefined);
    assert.equal(slugToPlace('not a url'), undefined);
  });
});

describe('deriveName', () => {
  it('keeps real names', () => {
    assert.equal(
      deriveName({ name: 'Capitec Bank Paarl Mall', type: 'branch' }),
      'Capitec Bank Paarl Mall',
    );
  });
  it('derives generic names from the slug', () => {
    assert.equal(
      deriveName({
        name: 'Capitec Bank',
        website: base + 'BankingFinance-CapeTown-CapitecBankDNRHoutBayCentre',
        type: 'branch',
      }),
      'Capitec Bank Hout Bay Centre',
    );
  });
  it('falls back to the suburb', () => {
    assert.equal(
      deriveName({ name: 'Capitec Bank', suburb: 'Paarl East', type: 'branch' }),
      'Capitec Bank Paarl East',
    );
  });
  it('business centres', () => {
    assert.equal(
      deriveName({
        name: 'Capitec Business Centre',
        website: base + 'BankingFinance-Paarl-CapitecBusinessCentrePaarl',
        type: 'business-centre',
      }),
      'Capitec Business Centre Paarl',
    );
  });
});

describe('normaliseName', () => {
  it('handles the odd source spellings', () => {
    assert.equal(normaliseName('CAPITEC BANK PAARL'), 'Capitec Bank PAARL');
    assert.equal(normaliseName('De Aar Capitec Bank'), 'Capitec Bank De Aar');
    assert.equal(normaliseName('Ulundi Capitec Bank.'), 'Capitec Bank Ulundi');
    assert.equal(normaliseName('Capitec Vredendal'), 'Capitec Bank Vredendal');
    assert.equal(
      normaliseName('Capitec Bank-Fourways Mall - Fourways'),
      'Capitec Bank Fourways Mall - Fourways',
    );
    assert.equal(normaliseName('Capitec Business Centre'), 'Capitec Business Centre');
  });
});

describe('sharePlaceToken', () => {
  it('matches names for the same place', () => {
    assert.ok(
      sharePlaceToken('Capitec Bank Kimberley North Cape Mall', 'Capitec Bank Kimberley Monument'),
    );
    assert.ok(sharePlaceToken('Capitec Bank Bizana Thompson', 'Capitec Bank Bizana Square'));
  });
  it('ignores generic words', () => {
    assert.ok(!sharePlaceToken('Capitec Bank Alberton City Mall', 'Capitec Bank Brooklyn Mall'));
    assert.ok(!sharePlaceToken('Capitec Bank', 'Capitec Bank Ltd'));
  });
});

describe('isCapitecBankName / classify', () => {
  it('filters', () => {
    assert.ok(isCapitecBankName('Capitec Bank Paarl Mall'));
    assert.ok(isCapitecBankName('De Aar Capitec Bank'));
    assert.ok(isCapitecBankName('Capitec Sasolburg'));
    assert.ok(!isCapitecBankName('Capitec Waste Management'));
    assert.ok(!isCapitecBankName('Capitech Bank'));
    assert.ok(!isCapitecBankName('Capitac Bank'));
  });
  it('classifies by name, not category', () => {
    assert.equal(
      classify('Capitec Business Centre', null, 'bank_or_credit_union'),
      'business-centre',
    );
    assert.equal(classify('Capitec Bank ATM', null, 'atm'), 'atm');
    assert.equal(classify('Capitec Bank ATM Freshstop Sinoville', null, 'atm'), 'atm');
    assert.equal(classify('Capitec Bank Strand Square', null, 'atm'), 'branch'); // bogus category on a real branch
    assert.equal(classify('Capitec Bank', null, 'restaurant'), 'branch');
    assert.equal(classify('Capitec Bank', base + 'x-CapitecBankATMWelcome', null), 'atm');
  });
});
