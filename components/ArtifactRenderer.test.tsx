import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArtifactRenderer from './ArtifactRenderer';
import * as tabular from '@/lib/tabular';

vi.mock('next/dynamic', () => ({
  default: () => function PlotMock({ data }: { data: unknown[] }) {
    return <div data-testid="plotly-chart" data-series={data.length} />;
  },
}));

describe('ArtifactRenderer', () => {
  it('renders a restored Plotly chart payload', () => {
    render(
      <ArtifactRenderer
        artifact={{
          type: 'graph',
          renderer: 'plotly',
          format: 'json',
          data: {
            props: {
              figure: {
                data: [{ type: 'bar', x: ['A'], y: [3] }],
                layout: { title: 'Stored chart' },
              },
            },
          },
        }}
      />,
    );

    expect(screen.getByTestId('plotly-chart')).toHaveAttribute('data-series', '1');
  });

  it('renders a restored table payload', () => {
    render(
      <ArtifactRenderer
        artifact={{
          type: 'table',
          data: {
            title: 'Stored table',
            columns: ['name', 'value'],
            rows: [{ name: 'A', value: 3 }],
          },
        }}
      />,
    );

    expect(screen.getByText('Stored table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '3' })).toBeInTheDocument();
  });

  it.each([
    { format: 'html', html: '<img src="x" onerror="window.untrusted = true">' },
    { format: 'html', url: 'https://example.com/chart.html' },
    { html: '<iframe src="https://example.com"></iframe>' },
    { url: 'https://example.com/chart.html' },
  ])('blocks legacy HTML and hosted chart payloads: %j', (payload) => {
    const { container } = render(
      <ArtifactRenderer artifact={{ type: 'graph', renderer: 'plotly', ...payload }} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Generate a JSON chart instead.');
    expect(container.querySelector('iframe, img, script')).toBeNull();
    expect(screen.queryByTestId('plotly-chart')).not.toBeInTheDocument();
  });
});


function columnarTable(count = 25) {
  return { type: 'table', schema_version: 2, renderer: 'dash-chat', format: 'json',
    data: { title: 'Columnar table', labels: ['Year', 'Value'],
      dataset: { type: 'tabular_data', schema_version: 1, format: 'json', orientation: 'columns',
        columns: ['year', 'value'], data: {
          value: Array.from({ length: count }, (_, index) => index === 0 ? null : `value-${index}`),
          year: Array.from({ length: count }, (_, index) => index),
        } }, props: { striped: true, hover: true, bordered: true } } };
}

describe('canonical table rendering', () => {
  it('uses explicit column order and paginates without rendering all rows', () => {
    render(<ArtifactRenderer artifact={columnarTable()} />);
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Year', 'Value']);
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.queryByRole('cell', { name: 'value-10' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('cell', { name: 'value-10' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '25' } });
    expect(screen.getAllByRole('row')).toHaveLength(26);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('preserves fullscreen state and supports Escape and outside dismissal', () => {
    render(<ArtifactRenderer artifact={columnarTable()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open fullscreen table' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(within(dialog).getByRole('cell', { name: 'value-10' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open fullscreen table' }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders empty datasets and legacy matrix tables', () => {
    const { rerender } = render(<ArtifactRenderer artifact={columnarTable(0)} />);
    expect(screen.getByText('No rows')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    rerender(<ArtifactRenderer artifact={{ type: 'table', columns: [{ key: 'a', label: 'A' }], rows: [[7]] }} />);
    expect(screen.getByRole('cell', { name: '7' })).toBeInTheDocument();
  });

  it.each([
    { ...columnarTable(), schema_version: 9 },
    { type: 'table', schema_version: 2, data: { dataset: { type: 'tabular_data', schema_version: 9 } } },
    { type: 'table', schema_version: 2, data: { dataset: { ...columnarTable().data.dataset, data: { year: [1], value: [] } } } },
  ])('reports invalid versioned data instead of dumping JSON', (artifact) => {
    render(<ArtifactRenderer artifact={artifact} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to render table');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('exports all pages only on Copy, and reports clipboard failures', async () => {
    const exportCsv = vi.spyOn(tabular, 'tableToCsv');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ArtifactRenderer artifact={columnarTable()} />);
    expect(writeText).not.toHaveBeenCalled();
    expect(exportCsv).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy as CSV' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(exportCsv).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('24,value-24');
    expect(writeText.mock.calls[0][0]).toContain('Year,Value\r\n0,');
    writeText.mockRejectedValue(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy as CSV' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Unable to copy'));
  });
});


it('downloads a CSV and releases the object URL', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:table-test');
  const revokeObjectURL = vi.fn();
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  try {
    render(<ArtifactRenderer artifact={columnarTable()} />);
    expect(createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:table-test');
  } finally { vi.unstubAllGlobals(); click.mockRestore(); }
});
