import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArtifactRenderer from './ArtifactRenderer';

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
