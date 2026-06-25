/**
 * DSK Bank (Bulgaria) CSV import + ETL normalization.
 *
 * DSK exports a UTF-8 (BOM) CSV with a metadata preamble, then a 13-column
 * transaction table. Pre-2026 statements are in BGN; from 2026 (euro adoption)
 * they are in EUR. We store `amount_eur` (cents) as the canonical value and, for
 * BGN rows, retain `original_amount` + `original_currency` for provenance.
 * Fixed conversion rate lives in formatCurrency.ts.
 */
import { bgnToEurCents } from '@/lib/formatCurrency';
import { guessCategory } from '@/lib/categories';

/** A mapped transaction row from the DSK table (raw, pre-normalization). */
export interface DskParsedRow {
  date: string; // dd.mm.yyyy (transaction date, col 11, falling back to booking date)
  merchantRaw: string; // counterparty / card-acceptor name (col 3)
  description: string; // long description (col 2)
  debit: string; // money out, Bulgarian-formatted (col 9)
  credit: string; // money in, Bulgarian-formatted (col 10)
  currency: 'EUR' | 'BGN';
}

export interface NormalizedTransaction {
  kind: 'expense' | 'income';
  amountEurCents: number;
  originalAmountCents: number | null;
  originalCurrency: 'BGN' | null;
  merchant: string;
  categoryGuess: string;
  date: string; // YYYY-MM-DD
}

/** Parse a Bulgarian decimal string ("1 234,56") into integer minor units. */
export function parseBgAmount(raw: string): number {
  const cleaned = raw
    .replace(/ /g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '') // thousands separator (if dot used)
    .replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

/** Convert DSK's dd.mm.yyyy to ISO YYYY-MM-DD. */
export function parseDskDate(raw: string): string {
  const m = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return raw;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

/** Collapse whitespace and trim a raw merchant/description string. */
export function cleanMerchant(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/**
 * Parse a quoted CSV document into rows of string cells.
 * Strips a leading BOM, honours `""` escapes, and keeps commas/newlines that
 * appear inside quoted fields. Handles CRLF and LF row separators.
 */
export function parseCsv(text: string): string[][] {
  let src = text;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (ch === '\r' && src[i + 1] === '\n') i++;
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const DSK_DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
const cell = (row: string[], i: number): string => (row[i] ?? '').trim();

/**
 * Parse a full DSK CSV export into transaction rows. Skips the metadata
 * preamble by locating the first row whose first cell is a dd.mm.yyyy date,
 * and infers the statement currency from the (preceding) table header.
 */
export function parseDskCsv(text: string): DskParsedRow[] {
  const rows = parseCsv(text);
  const firstDataIdx = rows.findIndex((r) => DSK_DATE_RE.test(cell(r, 0)));
  if (firstDataIdx < 0) return [];

  const header = rows[firstDataIdx - 1] ?? [];
  const currency: 'EUR' | 'BGN' = header.some((c) => /EUR/i.test(c)) ? 'EUR' : 'BGN';

  const out: DskParsedRow[] = [];
  for (const r of rows) {
    if (!DSK_DATE_RE.test(cell(r, 0))) continue;
    out.push({
      date: cell(r, 11) || cell(r, 0),
      merchantRaw: cell(r, 3),
      description: cell(r, 2),
      debit: cell(r, 9),
      credit: cell(r, 10),
      currency,
    });
  }
  return out;
}

/** Known card-acceptor / merchant names → clean display brand. First match wins. */
const BRAND_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bLIDL\b/i, 'Lidl'],
  [/\bKAUFLAND\b/i, 'Kaufland'],
  [/\bBILLA\b/i, 'Billa'],
  [/\bFANTASTICO\b/i, 'Fantastico'],
  [/SOPHARMACY/i, 'SOpharmacy'],
  [/\bDM\b/i, 'dm'],
  [/ANTHROPIC/i, 'Anthropic'],
  [/\bOMV\b/i, 'OMV'],
  [/\bSHELL\b/i, 'Shell'],
  [/NETFLIX/i, 'Netflix'],
  [/SPOTIFY/i, 'Spotify'],
];

const COUNTRY_RE = /^(BGR|USA|GBR|DEU|FRA|ITA|ESP|NLD|AUT|GRC|TUR|ROU|CHE|BEL)$/;
const ADDRESS_RE = /^(BUL|BULL|UL|UL\.|BLVD|ET|AP|NO|KV|ZH)$/i;

/** Strip DSK country + city prefix and trailing address noise from a Latin acceptor. */
function stripCardAcceptor(s: string): string {
  let tokens = s.split(' ').filter(Boolean);
  if (COUNTRY_RE.test(tokens[0] ?? '')) {
    tokens = tokens.slice(1); // drop country code
    if (tokens.length > 1) tokens = tokens.slice(1); // drop city
  }
  const cut = tokens.findIndex((t) => ADDRESS_RE.test(t));
  if (cut > 0) tokens = tokens.slice(0, cut);
  return tokens.join(' ').trim();
}

/**
 * Normalize a raw counterparty into a readable merchant. Known brands map to a
 * clean name; unknown Latin acceptors get their country/city prefix and address
 * suffix stripped; Cyrillic counterparties pass through cleaned.
 */
export function normalizeMerchant(raw: string): string {
  const cleaned = cleanMerchant(raw);
  for (const [pattern, name] of BRAND_RULES) {
    if (pattern.test(cleaned)) return name;
  }
  const isLatin = /[A-Za-z]/.test(cleaned) && !/[Ѐ-ӿ]/.test(cleaned);
  return isLatin ? stripCardAcceptor(cleaned) || cleaned : cleaned;
}

/**
 * Normalize one parsed DSK row into a transaction draft. Debit rows are
 * expenses, credit rows are income. BGN statements convert to EUR and retain
 * the original; EUR statements store cents directly.
 */
export function normalizeDskRow(row: DskParsedRow): NormalizedTransaction {
  const isIncome = row.debit === '' && row.credit !== '';
  const amountStr = isIncome ? row.credit : row.debit;
  const rawCents = Math.abs(parseBgAmount(amountStr));
  const merchant = normalizeMerchant(row.merchantRaw);
  const base = {
    kind: (isIncome ? 'income' : 'expense') as 'income' | 'expense',
    merchant,
    categoryGuess: guessCategory(merchant),
    date: parseDskDate(row.date),
  };

  if (row.currency === 'BGN') {
    return {
      ...base,
      amountEurCents: bgnToEurCents(rawCents),
      originalAmountCents: rawCents,
      originalCurrency: 'BGN',
    };
  }
  return {
    ...base,
    amountEurCents: rawCents,
    originalAmountCents: null,
    originalCurrency: null,
  };
}
