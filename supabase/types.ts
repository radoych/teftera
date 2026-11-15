export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      anomalies: {
        Row: {
          created_at: string
          household_id: string
          id: string
          reason: string
          reviewed: boolean
          score: number | null
          transaction_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          reason: string
          reviewed?: boolean
          score?: number | null
          transaction_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          reason?: string
          reviewed?: boolean
          score?: number | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anomalies_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "anomalies_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          account_uid: string
          bank_name: string
          created_at: string
          created_by: string
          household_id: string
          id: string
          provider: string
          session_id: string
          valid_until: string
        }
        Insert: {
          account_uid: string
          bank_name?: string
          created_at?: string
          created_by: string
          household_id: string
          id?: string
          provider?: string
          session_id: string
          valid_until: string
        }
        Update: {
          account_uid?: string
          bank_name?: string
          created_at?: string
          created_by?: string
          household_id?: string
          id?: string
          provider?: string
          session_id?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount_eur: number
          category_id: string | null
          created_at: string
          household_id: string
          id: string
          month: string
        }
        Insert: {
          amount_eur: number
          category_id?: string | null
          created_at?: string
          household_id: string
          id?: string
          month: string
        }
        Update: {
          amount_eur?: number
          category_id?: string | null
          created_at?: string
          household_id?: string
          id?: string
          month?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          household_id: string
          icon: string
          id: string
          is_default: boolean
          kind: string
          name: string
        }
        Insert: {
          color: string
          created_at?: string
          household_id: string
          icon: string
          id?: string
          is_default?: boolean
          kind?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          household_id?: string
          icon?: string
          id?: string
          is_default?: boolean
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          display_name: string | null
          household_id: string
          id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          display_name?: string | null
          household_id: string
          id?: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          display_name?: string | null
          household_id?: string
          id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          created_at: string
          household_id: string
          id: string
          processed_at: string | null
          raw_gemini_json: Json | null
          storage_path: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          processed_at?: string | null
          raw_gemini_json?: Json | null
          storage_path?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          processed_at?: string | null
          raw_gemini_json?: Json | null
          storage_path?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_eur: number
          category_id: string | null
          created_at: string
          date: string
          household_id: string
          id: string
          is_flagged: boolean
          kind: string
          merchant: string
          note: string | null
          occurred_at: string | null
          original_amount: number | null
          original_currency: string | null
          receipt_id: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          amount_eur: number
          category_id?: string | null
          created_at?: string
          date: string
          household_id: string
          id?: string
          is_flagged?: boolean
          kind?: string
          merchant: string
          note?: string | null
          occurred_at?: string | null
          original_amount?: number | null
          original_currency?: string | null
          receipt_id?: string | null
          source?: string
          user_id?: string | null
        }
        Update: {
          amount_eur?: number
          category_id?: string | null
          created_at?: string
          date?: string
          household_id?: string
          id?: string
          is_flagged?: boolean
          kind?: string
          merchant?: string
          note?: string | null
          occurred_at?: string | null
          original_amount?: number | null
          original_currency?: string | null
          receipt_id?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          household_id: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          household_id: string
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          household_id?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_household: {
        Args: { p_display_name: string; p_name: string }
        Returns: {
          id: string
          invite_code: string
        }[]
      }
      join_household_by_code: {
        Args: { p_code: string; p_display_name: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
