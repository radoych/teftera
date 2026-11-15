// features/loyalty/dbTypes.ts — hand-written row shapes for `public.loyalty_cards`.
//
// TEMPORARY: mirrors supabase/migrations/20261115130100_loyalty_cards.sql
// exactly. Delete this file and switch to `Tables<'loyalty_cards'>` /
// `TablesInsert<'loyalty_cards'>` (and drop the cast in ./api.ts) once
// `supabase/types.ts` is regenerated after the migration is applied — the
// vendors wave owns that file this wave.
//
// `type` aliases, not interfaces: supabase-js's GenericTable constraint needs
// an implicit index signature, which interfaces do not have.

/** One `loyalty_cards` row as PostgREST returns it. */
export type LoyaltyCardRow = {
  id: string;
  household_id: string;
  vendor_id: string | null;
  nickname: string;
  code: string;
  /** check (code_format in ('ean13', 'ean8', 'code128', 'qr')) — text in Postgres. */
  code_format: string;
  color: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Insert shape: defaulted / nullable columns are optional. */
export type LoyaltyCardInsert = {
  id?: string;
  household_id: string;
  vendor_id?: string | null;
  nickname: string;
  code: string;
  code_format: string;
  color?: string;
  note?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Update shape: every column optional. */
export type LoyaltyCardUpdate = Partial<LoyaltyCardInsert>;

/**
 * Just enough of a supabase-js `Database` to type `.from('loyalty_cards')`
 * until the generated types include the table. Used only by ./api.ts.
 */
export type LoyaltyDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
      loyalty_cards: {
        Row: LoyaltyCardRow;
        Insert: LoyaltyCardInsert;
        Update: LoyaltyCardUpdate;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
