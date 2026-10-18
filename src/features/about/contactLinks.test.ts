import { describe, expect, it } from '@jest/globals';

import { addressLink, instagramLink, ordinal, phoneLink, websiteLink } from './contactLinks';

describe('contact links', () => {
  it('encodes addresses for native maps on each platform', () => {
    const address = '  12 Café St, Sydney & Co  ';
    expect(addressLink(address, 'ios')).toBe('maps:0,0?q=12%20Caf%C3%A9%20St%2C%20Sydney%20%26%20Co');
    expect(addressLink(address, 'android')).toBe('geo:0,0?q=12%20Caf%C3%A9%20St%2C%20Sydney%20%26%20Co');
    expect(addressLink('Café', 'web')).toBe('https://maps.google.com/?q=Caf%C3%A9');
  });

  it.each(['', ' ', '\n\t'])('omits empty contact fields (%j)', (value) => {
    expect(addressLink(value, 'ios')).toBeNull();
    expect(phoneLink(value)).toBeNull();
    expect(websiteLink(value)).toBeNull();
    expect(instagramLink(value)).toBeNull();
  });

  it('keeps international phone prefixes and removes whitespace', () => {
    expect(phoneLink('  +61 2 1234 5678  ')).toBe('tel:+61212345678');
  });

  it.each([
    [' cafe.example/menu?q=coffee ', 'https://cafe.example/menu?q=coffee'],
    ['https://cafe.example', 'https://cafe.example'],
    ['http://cafe.example', 'http://cafe.example'],
    ['HTTPS://cafe.example', 'HTTPS://cafe.example'],
    ['//cafe.example', 'https://cafe.example'],
  ])('builds a website destination from %s', (input, expected) => {
    expect(websiteLink(input)).toBe(expected);
  });

  it('removes an Instagram @ prefix and surrounding whitespace', () => {
    expect(instagramLink('  @corner.cafe  ')).toBe('https://instagram.com/corner.cafe');
    expect(instagramLink('corner_cafe')).toBe('https://instagram.com/corner_cafe');
    expect(instagramLink(' @ ')).toBeNull();
    expect(instagramLink('@café?tag')).toBe('https://instagram.com/caf%C3%A9%3Ftag');
  });
});

describe('ordinal', () => {
  it.each([
    [1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [10, '10th'],
    [11, '11th'], [12, '12th'], [13, '13th'], [14, '14th'],
    [20, '20th'], [21, '21st'], [22, '22nd'], [23, '23rd'], [24, '24th'],
    [101, '101st'], [111, '111th'], [112, '112th'], [113, '113th'], [121, '121st'],
  ])('formats %i as %s', (value, expected) => {
    expect(ordinal(value)).toBe(expected);
  });
});
