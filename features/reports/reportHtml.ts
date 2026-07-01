// features/reports/reportHtml.ts
import { formatCurrency } from '@/lib/formatCurrency';
import type { ReportData, ReportCategory } from './types';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

function donutGradient(cats: ReportCategory[]): string {
  if (cats.length === 0) return '#343538';
  let acc = 0;
  const stops = cats.map((c, i) => {
    const start = acc * 100;
    acc += c.share;
    // Force the last segment to end at exactly 100.00% (guards float drift).
    const end = i === cats.length - 1 ? 100 : acc * 100;
    return `${c.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function pctLine(pct: number | null): string {
  if (pct === null) return '';
  const up = pct > 0;
  const color = up ? '#ffb4ab' : '#adc7ff';
  const arrow = up ? '▲' : '▼';
  return `<div class="pct" style="color:${color}">${arrow} ${Math.abs(pct)}% спрямо миналия месец</div>`;
}

export function buildReportHtml(data: ReportData, logoDataUri: string): string {
  const legend = data.categories
    .map(
      (c) => `<div class="row">
        <span class="dot" style="background:${c.color}"></span>
        <span class="grow">${esc(c.name)}</span>
        <span class="mono">${formatCurrency(c.totalCents)}</span>
      </div>`,
    )
    .join('');

  const trendBars = data.trend
    .map(
      (t) => `<div class="tcol">
        <div class="tbar ${t.isCurrent ? 'cur' : ''}" style="height:${Math.max(t.fraction * 100, 2)}%"></div>
        <div class="tlab">${esc(t.label)}</div>
      </div>`,
    )
    .join('');

  const merchantRows = data.merchants
    .map(
      (m) => `<div class="row">
        <span class="grow">${esc(m.merchant)}</span>
        <span class="mono">${formatCurrency(m.totalCents)}</span>
      </div>`,
    )
    .join('');

  const budgetRows = data.budgets
    .map((b) => {
      const barColor = b.state === 'over' ? '#ffb4ab' : b.state === 'warning' ? '#ffdfa7' : '#adc7ff';
      return `<div class="brow">
        <div class="row"><span class="grow">${esc(b.name)}</span>
          <span class="mono">${formatCurrency(b.spentCents)} / ${formatCurrency(b.budgetCents)}</span></div>
        <div class="track"><div class="fill" style="width:${Math.min(b.pct, 100)}%;background:${barColor}"></div></div>
      </div>`;
    })
    .join('');

  const anomalyBlock = data.anomalies.length
    ? `<div class="label">Аномалии</div>
       ${data.anomalies
         .map(
           (a) => `<div class="row"><span class="grow" style="color:#c3f400">${esc(a.merchant)}</span>
             <span class="mono" style="color:#c3f400">${formatCurrency(a.amountCents)}</span></div>
             <div class="reason">${esc(a.reason)}</div>`,
         )
         .join('')}`
    : '';

  const summaryBlock = data.aiSummary
    ? `<div class="summary"><div class="label">AI обобщение</div><p>${esc(data.aiSummary)}</p></div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #121316; color: #e3e2e6;
    font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; }
  .head { display: flex; align-items: center; gap: 16px; margin-bottom: 8px; }
  .head img { height: 40px; }
  .head .brand { font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: #8e909a; }
  .month { font-size: 28px; font-weight: 600; margin: 4px 0; }
  .total { font-size: 40px; font-weight: 600; color: #adc7ff; }
  .pct { font-size: 13px; margin-top: 4px; }
  .label { font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase;
    color: #8e909a; margin: 28px 0 12px; }
  hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 24px 0; }
  .donutwrap { display: flex; align-items: center; gap: 24px; }
  .donut { width: 140px; height: 140px; border-radius: 50%;
    background: ${donutGradient(data.categories)};
    -webkit-mask: radial-gradient(circle 42px at center, transparent 98%, #000 100%);
            mask: radial-gradient(circle 42px at center, transparent 98%, #000 100%); }
  .legend { flex: 1; }
  .row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
  .grow { flex: 1; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .mono { font-variant-numeric: tabular-nums; font-weight: 600; }
  .trend { display: flex; align-items: flex-end; gap: 12px; height: 120px; }
  .tcol { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .tbar { width: 100%; background: #343538; border-radius: 4px 4px 0 0; }
  .tbar.cur { background: rgba(173,199,255,0.5); border-top: 2px solid #adc7ff; }
  .tlab { font-size: 10px; color: #8e909a; margin-top: 6px; }
  .track { height: 6px; border-radius: 9999px; background: #1e2023; overflow: hidden; margin-top: 6px; }
  .fill { height: 100%; border-radius: 9999px; }
  .brow { margin-bottom: 14px; }
  .reason { font-size: 10px; text-transform: uppercase; color: #c3f400; margin-bottom: 8px; }
  .summary { border-left: 2px solid #adc7ff; padding-left: 12px; }
  .summary p { color: #c4c6d0; line-height: 1.6; font-size: 14px; margin: 0; }
</style></head>
<body>
  <div class="head"><img src="${logoDataUri}" alt="Teftera" /><div class="brand">Месечен отчет</div></div>
  <div class="month">${esc(data.monthLabel)}</div>
  <div class="total">${formatCurrency(data.totalCents)}</div>
  ${pctLine(data.pctVsPrevMonth)}
  ${summaryBlock}
  <hr />
  <div class="label">Разходи по категория</div>
  <div class="donutwrap"><div class="donut"></div><div class="legend">${legend || '<div class="reason">Няма разходи</div>'}</div></div>
  <hr />
  <div class="label">Месечна тенденция</div>
  <div class="trend">${trendBars}</div>
  <hr />
  <div class="label">Топ търговци</div>
  ${merchantRows || '<div class="reason">Няма търговци</div>'}
  <hr />
  <div class="label">Бюджет</div>
  ${budgetRows || '<div class="reason">Няма зададени бюджети</div>'}
  ${anomalyBlock ? '<hr />' + anomalyBlock : ''}
</body></html>`;
}
