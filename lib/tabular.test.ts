import { describe, expect, it, vi } from 'vitest';
import { parseDataset, parseTableArtifact, tableToCsv } from './tabular';

const dataset = { type: 'tabular_data', schema_version: 1, format: 'json', orientation: 'columns',
  columns: ['b', 'a'], data: { a: [null, { nested: true }], b: [1, 2] } };

describe('tabular compatibility boundary', () => {
  it('retains arrays by reference rather than transposing the dataset', () => {
    const parsed = parseDataset(dataset);
    expect(parsed.data.a).toBe(dataset.data.a);
    const view = parseTableArtifact({ type: 'table', schema_version: 2, data: { dataset } });
    expect(view.columns).toEqual(['b', 'a']);
    expect(view.cell(1, 0)).toBe(2);
    expect(view.cell(0, 1)).toBeNull();
  });
  it.each([
    { ...dataset, columns: ['a', 'a'] },
    { ...dataset, data: { b: [1], a: [] } },
    { ...dataset, data: { b: [Infinity], a: [null] } },
    { ...dataset, data: { b: [NaN], a: [null] } },
    { ...dataset, orientation: 'rows' },
  ])('rejects invalid datasets', (value) => expect(() => parseDataset(value)).toThrow());
  it('builds CSV lazily, preserving labels, commas, quotes, Unicode and nested JSON', () => {
    const cell = vi.fn((row: number) => row === 0 ? '中文,"quoted"\nnext' : { a: 1 });
    const table = { title: '', columns: ['a'], labels: ['Display'], props: {}, rowCount: 2, cell };
    expect(cell).not.toHaveBeenCalled();
    expect(tableToCsv(table)).toBe('Display\r\n"中文,""quoted""\nnext"\r\n"{""a"":1}"');
    expect(cell).toHaveBeenCalledTimes(2);
  });
});
