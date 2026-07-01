// features/reports/reportHtml.test.ts
import { buildReportHtml } from './reportHtml';
import type { ReportData } from './types';

const data: ReportData = {
  monthLabel: 'Юни 2026 г.',
  monthISO: '2026-06',
  totalCents: 4000,
  pctVsPrevMonth: 100,
  categories: [
    { name: 'Хранителни', color: '#adc7ff', totalCents: 3000, share: 0.75 },
    { name: 'Забавления', color: '#ffdfa7', totalCents: 1000, share: 0.25 },
  ],
  trend: [{ label: 'ЮНИ', fraction: 1, isCurrent: true }],
  merchants: [{ merchant: 'Kaufland <BG> & "co"', totalCents: 3000 }],
  budgets: [{ name: 'Хранителни', color: '#adc7ff', budgetCents: 5000, spentCents: 3000, pct: 60, state: 'under' }],
  anomalies: [{ merchant: 'Kaufland', amountCents: 3000, reason: 'Над обичайното' }],
  aiSummary: 'Тестово обобщение',
};

describe('buildReportHtml', () => {
  it('renders the month label and total', () => {
    const html = buildReportHtml(data, 'data:image/png;base64,AAA');
    expect(html).toContain('Юни 2026 г.');
    expect(html).toContain('€40,00'); // formatCurrency(4000)
  });

  it('embeds the logo data uri', () => {
    expect(buildReportHtml(data, 'data:image/png;base64,AAA')).toContain('src="data:image/png;base64,AAA"');
  });

  it('escapes user strings to avoid breaking the markup', () => {
    const html = buildReportHtml(data, 'x');
    expect(html).toContain('Kaufland &lt;BG&gt; &amp; &quot;co&quot;');
    expect(html).not.toContain('Kaufland <BG>');
  });

  it('builds a conic-gradient donut whose segments cover 100%', () => {
    const html = buildReportHtml(data, 'x');
    expect(html).toContain('conic-gradient(');
    expect(html).toContain('100.00%');
  });

  it('omits the anomalies and AI-summary blocks when empty', () => {
    const html = buildReportHtml({ ...data, anomalies: [], aiSummary: null }, 'x');
    expect(html).not.toContain('Аномалии');
    expect(html).not.toContain('AI обобщение');
  });
});
