// features/shopping/dbTypes.ts — hand-written row shapes for `public.shopping_lists`
// and `public.shopping_list_items`.
//
// TEMPORARY: mirrors supabase/migrations/20261115130200_shopping_lists.sql
// exactly. Delete this file and switch to `Tables<'shopping_lists'>` /
// `TablesInsert<'shopping_list_items'>` (and drop the cast in ./api.ts) once
// `supabase/types.ts` is regenerated after the migration is applied.
//
// `type` aliases, not interfaces: supabase-js's GenericTable constraint needs
// an implicit index signature, which interfaces do not have.

/** One `shopping_lists` row as PostgREST returns it. */
export type ShoppingListRow = {
  id: string;
  household_id: string;
  vendor_id: string | null;
  /** Snapshot of the vendor name at creation (check: not blank). */
  name: string;
  loyalty_card_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ShoppingListInsert = {
  id?: string;
  household_id: string;
  vendor_id?: string | null;
  name: string;
  loyalty_card_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ShoppingListUpdate = Partial<ShoppingListInsert>;

/** One `shopping_list_items` row as PostgREST returns it. */
export type ShoppingListItemRow = {
  id: string;
  household_id: string;
  list_id: string;
  /** check: not blank. */
  name: string;
  /** Free text: "2", "1 кг", "x3". */
  quantity: string | null;
  position: number;
  checked_at: string | null;
  checked_by: string | null;
  created_by: string | null;
  created_at: string;
};

export type ShoppingListItemInsert = {
  id?: string;
  household_id: string;
  list_id: string;
  name: string;
  quantity?: string | null;
  position?: number;
  checked_at?: string | null;
  checked_by?: string | null;
  created_by?: string | null;
  created_at?: string;
};

export type ShoppingListItemUpdate = Partial<ShoppingListItemInsert>;

/**
 * Just enough of a supabase-js `Database` to type `.from('shopping_lists')` /
 * `.from('shopping_list_items')` until the generated types include them.
 * Used only by ./api.ts.
 */
export type ShoppingDatabase = {
  __InternalSupabase: { PostgrestVersion: '14.18' };
  public: {
    Tables: {
      shopping_lists: {
        Row: ShoppingListRow;
        Insert: ShoppingListInsert;
        Update: ShoppingListUpdate;
        Relationships: [];
      };
      shopping_list_items: {
        Row: ShoppingListItemRow;
        Insert: ShoppingListItemInsert;
        Update: ShoppingListItemUpdate;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
