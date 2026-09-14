import { describe, it, expect } from 'vitest';
import { buildLabelSheetHtml } from './bulkPrint';

describe('buildLabelSheetHtml', () => {
  it('builds one label per item, with name and SKU present', async () => {
    const items = [
      { id: 'i1', name: 'Motolite NS40 Car Battery', sku: 'SKU-1', barcode: '123456789012' },
      { id: 'i2', name: 'Motolite MF9 Motorcycle Battery', sku: 'SKU-2', barcode: '987654321098' },
    ];
    const html = await buildLabelSheetHtml(items, 'https://example.com');
    expect(html).toContain('Motolite NS40 Car Battery');
    expect(html).toContain('SKU-1');
    expect(html).toContain('Motolite MF9 Motorcycle Battery');
    expect(html).toContain('SKU-2');
    expect((html.match(/class="label"/g) || []).length).toBe(2);
  });

  it('escapes item name/SKU so they cannot inject markup into the print window', async () => {
    const items = [{ id: 'i1', name: '<script>alert(1)</script>', sku: '"><img>', barcode: '123456789012' }];
    const html = await buildLabelSheetHtml(items, 'https://example.com');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns an empty sheet for an empty item list', async () => {
    const html = await buildLabelSheetHtml([], 'https://example.com');
    expect((html.match(/class="label"/g) || []).length).toBe(0);
  });

  it('skips a barcode image for an item with no barcode value, without throwing', async () => {
    const items = [{ id: 'i1', name: 'No Barcode Item', sku: 'SKU-3', barcode: '' }];
    const html = await buildLabelSheetHtml(items, 'https://example.com');
    expect(html).toContain('No Barcode Item');
    expect(html).not.toContain('<img class="label-barcode"');
  });
});
