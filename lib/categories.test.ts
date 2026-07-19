import {
  BRAND_RULES,
  DEFAULT_CATEGORIES,
  guessCategory,
  guessIncomeCategory,
  resolveCategoryId,
} from './categories';

describe('guessCategory', () => {
  it('matches known merchants', () => {
    expect(guessCategory('Starbucks Coffee')).toBe('Beverages');
    expect(guessCategory('LIDL Sofia')).toBe('Groceries');
    expect(guessCategory('Shell Station')).toBe('Transport');
  });

  it('matches Bulgarian keywords', () => {
    expect(guessCategory('Аптека 36.6')).toBe('Health');
  });

  it('falls back to Other', () => {
    expect(guessCategory('Some Unknown Place')).toBe('Other');
  });

  // ---------------------------------------------------------------------------
  // Groceries
  // ---------------------------------------------------------------------------
  describe('Groceries', () => {
    it.each([
      ['Kaufland Sofia'],
      ['BILLA 0042'],
      ['Fantastico'],
      ['T-Market Mladost'],
      ['T Market Center'],
      ['CBA Store'],
      ['Metro Cash And Carry'],
      ['МАГАЗИН НЕЩО'],
    ])('categorises %s as Groceries', (merchant) => {
      expect(guessCategory(merchant)).toBe('Groceries');
    });
  });

  // ---------------------------------------------------------------------------
  // Food & Dining
  // ---------------------------------------------------------------------------
  describe('Food & Dining', () => {
    it.each([
      ['McDonald\'s Bulgaria'],
      ['KFC Sofia Mall'],
      ['PIZZA HUT'],
      ['Burger King'],
      ['KEBAB HALIL'],
      ['Grill Master'],
      ['ГРИЛ ПАЛАС'],
      ['РЕСТОРАНТ ВИТОША'],
      ['GLOVO BG'],
      ['Bar Hemingway'],
    ])('categorises %s as Food & Dining', (merchant) => {
      expect(guessCategory(merchant)).toBe('Food & Dining');
    });
  });

  // ---------------------------------------------------------------------------
  // Beverages
  // ---------------------------------------------------------------------------
  describe('Beverages', () => {
    it.each([
      ['Starbucks Reserve'],
      ['Coffee Shop Sofia'],
      ['CAFE CENTRAL'],
      ['КАФЕ ЕВРОПА'],
    ])('categorises %s as Beverages', (merchant) => {
      expect(guessCategory(merchant)).toBe('Beverages');
    });
  });

  // ---------------------------------------------------------------------------
  // Transport
  // ---------------------------------------------------------------------------
  describe('Transport', () => {
    it.each([
      ['OMV Bulgaria'],
      ['EKO Station'],
      ['Lukoil Sofia'],
      ['БЕНЗИНОСТАНЦИЯ'],
      ['Bolt Mobility'],
      ['Uber Trip'],
      ['Taxi 91273'],
      ['ТАКСИ ЕЛИТ'],
    ])('categorises %s as Transport', (merchant) => {
      expect(guessCategory(merchant)).toBe('Transport');
    });
  });

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------
  describe('Health', () => {
    it.each([
      ['APTEKA BLAJEV B1'],
      ['АПТЕКА МАРЕШКИ'],
      ['Sopharmacy Sofia'],
      ['PHARMA PLUS'],
      ['АПТЕЧЕН СКЛАД'],
      ['БОЛНИЦА ТОКУДА'],
      ['Hospital Lozenets'],
      ['Clinic Tokuda'],
      ['МЕДИЦИНСКИ ЦЕНТЪР'],
      ['SMDL SEVAMED'],
      ['ЛАБОРАТОРИЯ СИНЛАБ'],
    ])('categorises %s as Health', (merchant) => {
      expect(guessCategory(merchant)).toBe('Health');
    });
  });

  // ---------------------------------------------------------------------------
  // Entertainment
  // ---------------------------------------------------------------------------
  describe('Entertainment', () => {
    it.each([
      ['Netflix'],
      ['Spotify AB'],
      ['HBO Max'],
      ['YouTube Premium'],
      ['Steam Games'],
      ['Anthropic PBC'],
      ['OpenAI LLC'],
      ['Cinema City'],
      ['Кино Арена'],
    ])('categorises %s as Entertainment', (merchant) => {
      expect(guessCategory(merchant)).toBe('Entertainment');
    });
  });

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  describe('Utilities', () => {
    it.each([
      ['Vivacom'],
      ['A1 Bulgaria'],
      ['Yettel Bulgaria'],
      ['ТОПЛОФИКАЦИЯ СОФИЯ ЕАД'],
      ['В И К - ШУМЕН ООД'],
      ['ВИК ВАРНА'],
      ['ВОДОСНАБДЯВАНЕ'],
      ['ЧЕЗ ЕЛЕКТРО'],
      ['Internet Provider'],
      ['ИНТЕРНЕТ УСЛУГИ'],
    ])('categorises %s as Utilities', (merchant) => {
      expect(guessCategory(merchant)).toBe('Utilities');
    });
  });

  // ---------------------------------------------------------------------------
  // Housing
  // ---------------------------------------------------------------------------
  describe('Housing', () => {
    it.each([
      ['Rent Payment March'],
      ['НАЕМ АПАРТАМЕНТ'],
      ['Mortgage BNB'],
      ['ИПОТЕКА УНИКРЕДИТ'],
    ])('categorises %s as Housing', (merchant) => {
      expect(guessCategory(merchant)).toBe('Housing');
    });
  });

  // ---------------------------------------------------------------------------
  // Shopping
  // ---------------------------------------------------------------------------
  describe('Shopping', () => {
    it.each([
      ['eMag.bg'],
      ['Technopolis'],
      ['TechnoMarket'],
      ['ZARA Sofia'],
      ['H&M Mall'],
      ['Pepco Store'],
      ['BULMAG 7'],
      ['Sofia Mall'],
      ['Amazon EU'],
      ['IKEA Sofia'],
      ['JYSK Bulgaria'],
    ])('categorises %s as Shopping', (merchant) => {
      expect(guessCategory(merchant)).toBe('Shopping');
    });

    it('does NOT match a Cyrillic merchant containing "мол" mid-word (МОЛЕРОВ ЕООД → Other)', () => {
      expect(guessCategory('МОЛЕРОВ ЕООД')).toBe('Other');
    });
  });

  // ---------------------------------------------------------------------------
  // Groceries — market keyword regression guard
  // ---------------------------------------------------------------------------
  describe('Groceries — market keyword', () => {
    it('categorises CITY MARKET as Groceries', () => {
      expect(guessCategory('CITY MARKET')).toBe('Groceries');
    });

    it('categorises FRESH MARKET as Groceries', () => {
      expect(guessCategory('FRESH MARKET')).toBe('Groceries');
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown local shops / personal counterparties → Other
  // ---------------------------------------------------------------------------
  describe('Other (unknown local shops)', () => {
    it.each([
      ['TRANCHEV OOD'],
      ['ZOO GRUP STEFANOV'],
      ['EVGENI PANAYOTOV'],
      ['YORDAN HARIZANOV'],
      ['BULMAG 7'],  // already covered above as Shopping; duplicate to confirm Shopping wins
    ])('categorises %s correctly (Shopping or Other)', (merchant) => {
      // BULMAG 7 should be Shopping; the rest should be Other
      const result = guessCategory(merchant);
      if (merchant === 'BULMAG 7') {
        expect(result).toBe('Shopping');
      } else {
        expect(result).toBe('Other');
      }
    });
  });

  it('every default category name is unique', () => {
    const names = DEFAULT_CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('always has an Other category for the fallback', () => {
    expect(DEFAULT_CATEGORIES.some((c) => c.name === 'Other')).toBe(true);
  });
});

describe('resolveCategoryId', () => {
  const cats = [
    { id: 'cat-bev', name: 'Beverages' },
    { id: 'cat-gro', name: 'Groceries' },
    { id: 'cat-other', name: 'Other' },
  ];

  it('resolves a known merchant to its category id', () => {
    expect(resolveCategoryId('Starbucks Coffee', cats)).toBe('cat-bev');
    expect(resolveCategoryId('LIDL Sofia', cats)).toBe('cat-gro');
  });

  it('falls back to the Other category id when nothing matches', () => {
    expect(resolveCategoryId('Some Unknown Place', cats)).toBe('cat-other');
  });

  it('returns null when even Other is missing', () => {
    expect(resolveCategoryId('Whatever', [{ id: 'x', name: 'Beverages' }])).toBeNull();
  });
});

describe('income rules', () => {
  it('salary keywords → Заплата', () => {
    expect(guessIncomeCategory('ЗАПЛАТА ЮНИ 2026')).toBe('Заплата');
    expect(guessIncomeCategory('Salary payment ACME')).toBe('Заплата');
  });
  it('unknown income → Друг приход', () => {
    expect(guessIncomeCategory('IBAN превод Иван')).toBe('Друг приход');
  });
});

describe('unified merchant table', () => {
  it('dm is branded and categorized as Shopping (was Other)', () => {
    expect(guessCategory('BGR SOFIA DM 340')).toBe('Shopping');
    expect(BRAND_RULES.some(([re, brand]) => brand === 'dm' && re.test('DM 340'))).toBe(true);
  });
});

describe('kind-aware resolveCategoryId', () => {
  const cats = [
    { id: 'e1', name: 'Groceries', kind: 'expense' as const },
    { id: 'e2', name: 'Other', kind: 'expense' as const },
    { id: 'i1', name: 'Заплата', kind: 'income' as const },
    { id: 'i2', name: 'Друг приход', kind: 'income' as const },
  ];
  it('income guess maps to income category', () => {
    expect(resolveCategoryId('ЗАПЛАТА ЮНИ', cats, 'income')).toBe('i1');
  });
  it('unknown income falls back to Друг приход', () => {
    expect(resolveCategoryId('превод', cats, 'income')).toBe('i2');
  });
  it('expense default is unchanged', () => {
    expect(resolveCategoryId('LIDL SOFIA', cats)).toBe('e1');
  });
  it('income never resolves to an expense category', () => {
    expect(resolveCategoryId('lidl', cats, 'income')).toBe('i2');
  });
});
