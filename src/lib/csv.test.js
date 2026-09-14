import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvObjects, toCsv } from './csv';

describe('parseCsv', () => {
  it('splits a simple comma-separated grid into rows of fields', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles a quoted field containing a comma', () => {
    expect(parseCsv('name,note\n"Motolite N50, 12V",fine')).toEqual([
      ['name', 'note'], ['Motolite N50, 12V', 'fine'],
    ]);
  });

  it('handles a quoted field containing an embedded newline', () => {
    expect(parseCsv('name,note\n"Line one\nLine two",x')).toEqual([
      ['name', 'note'], ['Line one\nLine two', 'x'],
    ]);
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCsv('note\n"She said ""hi"""')).toEqual([['note'], ['She said "hi"']]);
  });

  it('tolerates a missing trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parseCsvObjects', () => {
  it('keys each row by the header row', () => {
    expect(parseCsvObjects('name,qty\nMF9,10\nNS40,5')).toEqual([
      { name: 'MF9', qty: '10' }, { name: 'NS40', qty: '5' },
    ]);
  });

  it('skips wholly blank lines', () => {
    expect(parseCsvObjects('name,qty\nMF9,10\n\nNS40,5\n')).toEqual([
      { name: 'MF9', qty: '10' }, { name: 'NS40', qty: '5' },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsvObjects('')).toEqual([]);
  });
});

describe('toCsv', () => {
  it('writes a header row followed by one row per object, in the given column order', () => {
    const csv = toCsv(['sku', 'name'], [{ sku: 'A1', name: 'Battery' }]);
    expect(csv).toBe('sku,name\nA1,Battery');
  });

  it('quotes a field containing a comma, quote, or newline', () => {
    const csv = toCsv(['name'], [{ name: 'Say "hi", ok' }]);
    expect(csv).toBe('name\n"Say ""hi"", ok"');
  });

  it('round-trips through parseCsvObjects', () => {
    const rows = [{ sku: 'A1', name: 'Battery, 12V' }, { sku: 'B2', name: 'Charger "Pro"' }];
    const csv = toCsv(['sku', 'name'], rows);
    expect(parseCsvObjects(csv)).toEqual(rows);
  });
});
