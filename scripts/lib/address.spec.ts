import { assert, describe, it } from 'vitest';
import { parseFreeformAddress, parseStructuredAddress, provinceFromRegion } from './address.ts';

describe('parseFreeformAddress', () => {
  it('parses a full address from the end', () => {
    assert.deepEqual(
      parseFreeformAddress(
        'Shop 8, Hout Bay Centre, Melkhout Crescent, Scott Estate, Cape Town, Western Cape, 7806, South Africa',
      ),
      {
        street: 'Shop 8, Hout Bay Centre, Melkhout Crescent',
        suburb: 'Scott Estate',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '7806',
      },
    );
  });

  it('small town without a suburb: suburb = city, street keeps the street line', () => {
    assert.deepEqual(
      parseFreeformAddress('Shop 5, 1 Botriver Road, Kleinmond, Western Cape, 7195, South Africa'),
      {
        street: 'Shop 5, 1 Botriver Road',
        suburb: 'Kleinmond',
        city: 'Kleinmond',
        province: 'Western Cape',
        postalCode: '7195',
      },
    );
  });

  it('treats "City Centre" as a suburb, not a building', () => {
    const a = parseFreeformAddress(
      'Ground Floor, Roggebaai Place, Jetty Street, Cape Town City Centre, Cape Town, Western Cape, 8000, South Africa',
    );
    assert.equal(a.suburb, 'Cape Town City Centre');
    assert.equal(a.street, 'Ground Floor, Roggebaai Place, Jetty Street');
  });

  it('keeps "Mitchells Plain" as a suburb', () => {
    assert.equal(
      parseFreeformAddress(
        'Shop 10, Westgate Mall, Morgenster Road, Mitchells Plain, Cape Town, Western Cape, 7785, South Africa',
      ).suburb,
      'Mitchells Plain',
    );
  });

  it('copes with a missing postcode', () => {
    const a = parseFreeformAddress('Shop 2, Main Road, Paarl, Western Cape, South Africa');
    assert.equal(a.city, 'Paarl');
    assert.equal(a.province, 'Western Cape');
    assert.equal(a.postalCode, undefined);
  });

  it('keeps a wrong postcode as-is (Paarl 8000)', () => {
    assert.equal(
      parseFreeformAddress('Lady Grey Street, Paarl, Western Cape, 8000, South Africa').postalCode,
      '8000',
    );
  });

  it('accepts province spellings', () => {
    assert.equal(
      parseFreeformAddress('1 Smith Street, Durban, Kwazulu-Natal, 4001, South Africa').province,
      'KwaZulu-Natal',
    );
    assert.equal(
      parseFreeformAddress('1 Smith Street, Mahikeng, North West, 2745, South Africa').province,
      'North West',
    );
  });

  it('treats an unparseable string as street only', () => {
    assert.deepEqual(parseFreeformAddress('66 Main Rd'), { street: '66 Main Rd' });
    assert.deepEqual(parseFreeformAddress(null), { street: '' });
  });

  it('preserves apostrophes', () => {
    assert.equal(
      parseFreeformAddress(
        "Sir Lowry's Pass Road, Gordon's Bay, Cape Town, Western Cape, 7140, South Africa",
      ).suburb,
      "Gordon's Bay",
    );
  });
});

describe('structured addresses', () => {
  it('maps region codes to provinces', () => {
    assert.equal(provinceFromRegion('ZA-WC'), 'Western Cape');
    assert.equal(provinceFromRegion('WC'), 'Western Cape');
    assert.equal(provinceFromRegion('ZA-GP'), 'Gauteng');
    assert.equal(provinceFromRegion('ZA-NL'), 'KwaZulu-Natal');
    assert.equal(provinceFromRegion('ZA-XX'), undefined);
    assert.equal(provinceFromRegion(null), undefined);
  });

  it('locality becomes suburb and city', () => {
    assert.deepEqual(
      parseStructuredAddress({
        freeform: 'Shop G13, Longbeach Mall',
        locality: 'Noordhoek',
        postcode: '7979',
        region: 'ZA-WC',
      }),
      {
        street: 'Shop G13, Longbeach Mall',
        suburb: 'Noordhoek',
        city: 'Noordhoek',
        province: 'Western Cape',
        postalCode: '7979',
      },
    );
  });
});
