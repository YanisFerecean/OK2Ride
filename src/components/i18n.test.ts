import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../config';
import { TEST_IDS } from '../types';
import { DE, EN, LOCALES, resolveStrings } from './i18n';
import { FAILURE_MESSAGES, TEST_INFO } from './testInfo';

describe('resolveStrings', () => {
  it('matches on the primary subtag, so regional tags resolve', () => {
    expect(resolveStrings('de')).toBe(DE);
    expect(resolveStrings('de-AT')).toBe(DE);
    expect(resolveStrings('DE_CH')).toBe(DE);
    expect(resolveStrings('  de-DE  ')).toBe(DE);
    expect(resolveStrings('en-GB')).toBe(EN);
  });

  it('falls back to English for unknown, empty and missing tags', () => {
    expect(resolveStrings('fr')).toBe(EN);
    expect(resolveStrings('')).toBe(EN);
    expect(resolveStrings(null)).toBe(EN);
    expect(resolveStrings(undefined)).toBe(EN);
  });
});

describe('catalogues', () => {
  const config = resolveConfig();

  it('cover every test and every failure reason in each language', () => {
    for (const strings of Object.values(LOCALES)) {
      expect(Object.keys(strings.tests).sort()).toEqual([...TEST_IDS].sort());
      expect(Object.keys(strings.failures).sort()).toEqual(Object.keys(EN.failures).sort());
      for (const id of TEST_IDS) {
        expect(strings.tests[id].name.length).toBeGreaterThan(0);
        expect(strings.tests[id].describe(config).length).toBeGreaterThan(0);
      }
    }
  });

  it('leaves nothing untranslated in German', () => {
    for (const id of TEST_IDS) {
      expect(DE.tests[id].name).not.toBe(EN.tests[id].name);
      expect(DE.tests[id].describe(config)).not.toBe(EN.tests[id].describe(config));
    }
    for (const reason of Object.keys(EN.failures) as (keyof typeof EN.failures)[]) {
      expect(DE.failures[reason]).not.toBe(EN.failures[reason]);
    }
    expect(DE.idleTitle).not.toBe(EN.idleTitle);
    expect(DE.resultPass).not.toBe(EN.resultPass);
  });

  it('interpolates per language rather than concatenating', () => {
    expect(EN.stageLabel(1, 2, 'Reaction')).toBe('Test 1 of 2 · Reaction');
    expect(DE.stageLabel(1, 2, 'Reaktion')).toBe('Test 1 von 2 · Reaktion');
    expect(EN.angle(-30)).toBe('30° left');
    expect(DE.angle(-30)).toBe('30° links');
    expect(EN.angle(0)).toBe('0°');
    expect(DE.angle(0)).toBe('0°');
  });

  it('keeps the publicly exported constants on English', () => {
    expect(TEST_INFO).toBe(EN.tests);
    expect(FAILURE_MESSAGES).toBe(EN.failures);
    expect(TEST_INFO.pvt.name).toBe('Reaction');
    expect(FAILURE_MESSAGES.TOO_MANY_LAPSES).toBe('Too many slow reactions were detected.');
  });
});
