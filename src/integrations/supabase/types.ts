export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      m_batches: {
        Row: {
          batch_no: string;
          created_at: string;
          created_by: string | null;
          expiry_date: string | null;
          id: number;
          mfg_date: string | null;
          received_at: string;
          sku_id: number;
          updated_at: string;
        };
        Insert: {
          batch_no: string;
          created_at?: string;
          created_by?: string | null;
          expiry_date?: string | null;
          id?: never;
          mfg_date?: string | null;
          received_at?: string;
          sku_id: number;
          updated_at?: string;
        };
        Update: {
          batch_no?: string;
          created_at?: string;
          created_by?: string | null;
          expiry_date?: string | null;
          id?: never;
          mfg_date?: string | null;
          received_at?: string;
          sku_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "m_batches_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_batches_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
        ];
      };
      m_categories: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: number;
          is_active: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          is_active?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          is_active?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "m_categories_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      m_customers: {
        Row: {
          address: string | null;
          code: string;
          contact_name: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          id: number;
          is_active: boolean;
          name: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          code: string;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: never;
          is_active?: boolean;
          name: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          code?: string;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: never;
          is_active?: boolean;
          name?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "m_customers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      m_features: {
        Row: {
          feature_key: string;
          feature_name: string;
          icon_name: string | null;
          id: number;
          path: string | null;
        };
        Insert: {
          feature_key: string;
          feature_name: string;
          icon_name?: string | null;
          id?: never;
          path?: string | null;
        };
        Update: {
          feature_key?: string;
          feature_name?: string;
          icon_name?: string | null;
          id?: never;
          path?: string | null;
        };
        Relationships: [];
      };
      m_locations: {
        Row: {
          allowed_category_ids: number[];
          bin_type: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          full_code: string;
          grid_x: number | null;
          grid_y: number | null;
          id: number;
          is_active: boolean;
          is_counting: boolean;
          level: string;
          max_qty: number | null;
          max_weight_kg: number | null;
          parent_id: number | null;
          pick_sequence: number;
          updated_at: string;
          warehouse_id: number;
        };
        Insert: {
          allowed_category_ids?: number[];
          bin_type?: string | null;
          code: string;
          created_at?: string;
          created_by?: string | null;
          full_code?: string;
          grid_x?: number | null;
          grid_y?: number | null;
          id?: never;
          is_active?: boolean;
          is_counting?: boolean;
          level: string;
          max_qty?: number | null;
          max_weight_kg?: number | null;
          parent_id?: number | null;
          pick_sequence?: number;
          updated_at?: string;
          warehouse_id: number;
        };
        Update: {
          allowed_category_ids?: number[];
          bin_type?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          full_code?: string;
          grid_x?: number | null;
          grid_y?: number | null;
          id?: never;
          is_active?: boolean;
          is_counting?: boolean;
          level?: string;
          max_qty?: number | null;
          max_weight_kg?: number | null;
          parent_id?: number | null;
          pick_sequence?: number;
          updated_at?: string;
          warehouse_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "m_locations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_locations_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_locations_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      m_owners: {
        Row: {
          code: string;
          contact_name: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          id: number;
          is_active: boolean;
          name: string;
          owner_type: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          code: string;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: never;
          is_active?: boolean;
          name: string;
          owner_type: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          code?: string;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: never;
          is_active?: boolean;
          name?: string;
          owner_type?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "m_owners_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      m_products: {
        Row: {
          category_id: number | null;
          code: string;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: number;
          is_active: boolean;
          name: string;
          owner_id: number;
          updated_at: string;
          variant_attributes: string[];
        };
        Insert: {
          category_id?: number | null;
          code: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: never;
          is_active?: boolean;
          name: string;
          owner_id: number;
          updated_at?: string;
          variant_attributes?: string[];
        };
        Update: {
          category_id?: number | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: never;
          is_active?: boolean;
          name?: string;
          owner_id?: number;
          updated_at?: string;
          variant_attributes?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "m_products_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "m_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_products_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_products_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
        ];
      };
      m_roles: {
        Row: {
          created_at: string;
          id: number;
          rank: number;
          role_name: string;
        };
        Insert: {
          created_at?: string;
          id: number;
          rank: number;
          role_name: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          rank?: number;
          role_name?: string;
        };
        Relationships: [];
      };
      m_settings: {
        Row: {
          company_name: string;
          created_at: string;
          currency: string;
          demo_mode: boolean;
          demo_seed_requested_at: string | null;
          doc_prefixes: NonNullable<Json>;
          expiry_warning_days: number;
          id: number;
          locked_until: string | null;
          min_shelf_life_days: number;
          timezone: string;
          updated_at: string;
          valuation_method: string;
        };
        Insert: {
          company_name?: string;
          created_at?: string;
          currency?: string;
          demo_mode?: boolean;
          demo_seed_requested_at?: string | null;
          doc_prefixes?: NonNullable<Json>;
          expiry_warning_days?: number;
          id?: number;
          locked_until?: string | null;
          min_shelf_life_days?: number;
          timezone?: string;
          updated_at?: string;
          valuation_method?: string;
        };
        Update: {
          company_name?: string;
          created_at?: string;
          currency?: string;
          demo_mode?: boolean;
          demo_seed_requested_at?: string | null;
          doc_prefixes?: NonNullable<Json>;
          expiry_warning_days?: number;
          id?: number;
          locked_until?: string | null;
          min_shelf_life_days?: number;
          timezone?: string;
          updated_at?: string;
          valuation_method?: string;
        };
        Relationships: [];
      };
      m_sku_costs: {
        Row: {
          avg_cost: number;
          last_cost: number;
          owner_id: number;
          sku_id: number;
          updated_at: string;
        };
        Insert: {
          avg_cost?: number;
          last_cost?: number;
          owner_id: number;
          sku_id: number;
          updated_at?: string;
        };
        Update: {
          avg_cost?: number;
          last_cost?: number;
          owner_id?: number;
          sku_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "m_sku_costs_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_sku_costs_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
        ];
      };
      m_sku_uoms: {
        Row: {
          barcode: string | null;
          created_at: string;
          created_by: string | null;
          factor_to_base: number;
          id: number;
          sku_id: number;
          uom_id: number;
          updated_at: string;
        };
        Insert: {
          barcode?: string | null;
          created_at?: string;
          created_by?: string | null;
          factor_to_base: number;
          id?: never;
          sku_id: number;
          uom_id: number;
          updated_at?: string;
        };
        Update: {
          barcode?: string | null;
          created_at?: string;
          created_by?: string | null;
          factor_to_base?: number;
          id?: never;
          sku_id?: number;
          uom_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "m_sku_uoms_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_sku_uoms_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_sku_uoms_uom_id_fkey";
            columns: ["uom_id"];
            isOneToOne: false;
            referencedRelation: "m_uoms";
            referencedColumns: ["id"];
          },
        ];
      };
      m_skus: {
        Row: {
          attributes: NonNullable<Json>;
          barcode: string | null;
          base_uom_id: number;
          created_at: string;
          created_by: string | null;
          height_cm: number | null;
          id: number;
          is_active: boolean;
          length_cm: number | null;
          product_id: number;
          reorder_point: number;
          reorder_qty: number;
          safety_stock: number;
          sku_code: string;
          track_batch: boolean;
          track_expiry: boolean;
          updated_at: string;
          weight_kg: number | null;
          width_cm: number | null;
        };
        Insert: {
          attributes?: NonNullable<Json>;
          barcode?: string | null;
          base_uom_id: number;
          created_at?: string;
          created_by?: string | null;
          height_cm?: number | null;
          id?: never;
          is_active?: boolean;
          length_cm?: number | null;
          product_id: number;
          reorder_point?: number;
          reorder_qty?: number;
          safety_stock?: number;
          sku_code: string;
          track_batch?: boolean;
          track_expiry?: boolean;
          updated_at?: string;
          weight_kg?: number | null;
          width_cm?: number | null;
        };
        Update: {
          attributes?: NonNullable<Json>;
          barcode?: string | null;
          base_uom_id?: number;
          created_at?: string;
          created_by?: string | null;
          height_cm?: number | null;
          id?: never;
          is_active?: boolean;
          length_cm?: number | null;
          product_id?: number;
          reorder_point?: number;
          reorder_qty?: number;
          safety_stock?: number;
          sku_code?: string;
          track_batch?: boolean;
          track_expiry?: boolean;
          updated_at?: string;
          weight_kg?: number | null;
          width_cm?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "m_skus_base_uom_id_fkey";
            columns: ["base_uom_id"];
            isOneToOne: false;
            referencedRelation: "m_uoms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_skus_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "m_skus_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "m_products";
            referencedColumns: ["id"];
          },
        ];
      };
      m_suppliers: {
        Row: {
          address: string | null;
          code: string;
          contact_name: string | null;
          created_at: string;
          created_by: string | null;
          email: string | null;
          id: number;
          is_active: boolean;
          name: string;
          phone: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          code: string;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: never;
          is_active?: boolean;
          name: string;
          phone?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          code?: string;
          contact_name?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          id?: never;
          is_active?: boolean;
          name?: string;
          phone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "m_suppliers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      m_uoms: {
        Row: {
          code: string;
          created_at: string;
          created_by: string | null;
          id: number;
          is_active: boolean;
          is_decimal: boolean;
          name: string;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          is_active?: boolean;
          is_decimal?: boolean;
          name: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          is_active?: boolean;
          is_decimal?: boolean;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "m_uoms_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      m_warehouses: {
        Row: {
          address: string | null;
          code: string;
          created_at: string;
          created_by: string | null;
          id: number;
          is_active: boolean;
          latitude: number | null;
          longitude: number | null;
          name: string;
          updated_at: string;
          warehouse_type: string;
        };
        Insert: {
          address?: string | null;
          code: string;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          is_active?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          updated_at?: string;
          warehouse_type?: string;
        };
        Update: {
          address?: string | null;
          code?: string;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          is_active?: boolean;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          updated_at?: string;
          warehouse_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "m_warehouses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string | null;
          id: string;
          is_superadmin: boolean;
          language_preference: string | null;
          phone_number: string | null;
          role_id: number | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id: string;
          is_superadmin?: boolean;
          language_preference?: string | null;
          phone_number?: string | null;
          role_id?: number | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          full_name?: string | null;
          id?: string;
          is_superadmin?: boolean;
          language_preference?: string | null;
          phone_number?: string | null;
          role_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "m_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_api_idempotency: {
        Row: {
          api_key_id: number;
          created_at: string;
          idem_key: string;
          response: NonNullable<Json>;
        };
        Insert: {
          api_key_id: number;
          created_at?: string;
          idem_key: string;
          response: NonNullable<Json>;
        };
        Update: {
          api_key_id?: number;
          created_at?: string;
          idem_key?: string;
          response?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "t_api_idempotency_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "t_api_keys";
            referencedColumns: ["id"];
          },
        ];
      };
      t_api_keys: {
        Row: {
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: number;
          key_hash: string;
          last_used_at: string | null;
          name: string;
          owner_id: number | null;
          prefix: string;
          revoked_at: string | null;
          scopes: string[];
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: never;
          key_hash: string;
          last_used_at?: string | null;
          name: string;
          owner_id?: number | null;
          prefix: string;
          revoked_at?: string | null;
          scopes: string[];
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: never;
          key_hash?: string;
          last_used_at?: string | null;
          name?: string;
          owner_id?: number | null;
          prefix?: string;
          revoked_at?: string | null;
          scopes?: string[];
        };
        Relationships: [
          {
            foreignKeyName: "t_api_keys_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_api_keys_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
        ];
      };
      t_api_request_log: {
        Row: {
          api_key_id: number | null;
          created_at: string;
          id: number;
          method: string;
          path: string;
          status: number;
        };
        Insert: {
          api_key_id?: number | null;
          created_at?: string;
          id?: never;
          method: string;
          path: string;
          status: number;
        };
        Update: {
          api_key_id?: number | null;
          created_at?: string;
          id?: never;
          method?: string;
          path?: string;
          status?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_api_request_log_api_key_id_fkey";
            columns: ["api_key_id"];
            isOneToOne: false;
            referencedRelation: "t_api_keys";
            referencedColumns: ["id"];
          },
        ];
      };
      t_attachments: {
        Row: {
          created_at: string;
          created_by: string;
          entity_id: number;
          entity_table: string;
          file_name: string;
          id: number;
          mime_type: string;
          size_bytes: number;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          entity_id: number;
          entity_table: string;
          file_name: string;
          id?: never;
          mime_type: string;
          size_bytes: number;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          entity_id?: number;
          entity_table?: string;
          file_name?: string;
          id?: never;
          mime_type?: string;
          size_bytes?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_attachments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          detail: Json | null;
          entity_id: string;
          entity_type: string;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          entity_id: string;
          entity_type: string;
          id?: never;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          detail?: Json | null;
          entity_id?: string;
          entity_type?: string;
          id?: never;
        };
        Relationships: [
          {
            foreignKeyName: "t_audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_avg_cost_log: {
        Row: {
          avg_cost: number;
          effective_date: string;
          id: number;
          owner_id: number;
          sku_id: number;
        };
        Insert: {
          avg_cost: number;
          effective_date: string;
          id?: never;
          owner_id: number;
          sku_id: number;
        };
        Update: {
          avg_cost?: number;
          effective_date?: string;
          id?: never;
          owner_id?: number;
          sku_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_avg_cost_log_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_avg_cost_log_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
        ];
      };
      t_cogs_entries: {
        Row: {
          cost_average: number;
          cost_fifo: number;
          id: number;
          kind: string;
          movement_date: string;
          movement_id: number | null;
          owner_id: number;
          qty: number;
          receipt_line_id: number | null;
          sku_id: number;
        };
        Insert: {
          cost_average: number;
          cost_fifo: number;
          id?: never;
          kind: string;
          movement_date: string;
          movement_id?: number | null;
          owner_id: number;
          qty: number;
          receipt_line_id?: number | null;
          sku_id: number;
        };
        Update: {
          cost_average?: number;
          cost_fifo?: number;
          id?: never;
          kind?: string;
          movement_date?: string;
          movement_id?: number | null;
          owner_id?: number;
          qty?: number;
          receipt_line_id?: number | null;
          sku_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_cogs_entries_movement_id_fkey";
            columns: ["movement_id"];
            isOneToOne: true;
            referencedRelation: "t_stock_movements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_cogs_entries_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_cogs_entries_receipt_line_id_fkey";
            columns: ["receipt_line_id"];
            isOneToOne: false;
            referencedRelation: "t_goods_receipt_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_cogs_entries_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
        ];
      };
      t_cost_layers: {
        Row: {
          id: number;
          is_estimate: boolean;
          owner_id: number;
          qty_in: number;
          qty_remaining: number;
          received_at: string;
          sku_id: number;
          source_movement_id: number;
          unit_cost: number;
          warehouse_id: number;
        };
        Insert: {
          id?: never;
          is_estimate?: boolean;
          owner_id: number;
          qty_in: number;
          qty_remaining: number;
          received_at: string;
          sku_id: number;
          source_movement_id: number;
          unit_cost: number;
          warehouse_id: number;
        };
        Update: {
          id?: never;
          is_estimate?: boolean;
          owner_id?: number;
          qty_in?: number;
          qty_remaining?: number;
          received_at?: string;
          sku_id?: number;
          source_movement_id?: number;
          unit_cost?: number;
          warehouse_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_cost_layers_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_cost_layers_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_cost_layers_source_movement_id_fkey";
            columns: ["source_movement_id"];
            isOneToOne: true;
            referencedRelation: "t_stock_movements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_cost_layers_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      t_doc_counters: {
        Row: {
          last_no: number;
          period: string;
          prefix: string;
        };
        Insert: {
          last_no: number;
          period: string;
          prefix: string;
        };
        Update: {
          last_no?: number;
          period?: string;
          prefix?: string;
        };
        Relationships: [];
      };
      t_error_log: {
        Row: {
          context: Json | null;
          created_at: string;
          id: number;
          message: string;
          source: string;
          user_id: string | null;
        };
        Insert: {
          context?: Json | null;
          created_at?: string;
          id?: never;
          message: string;
          source: string;
          user_id?: string | null;
        };
        Update: {
          context?: Json | null;
          created_at?: string;
          id?: never;
          message?: string;
          source?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      t_goods_receipt_lines: {
        Row: {
          base_qty_accepted: number | null;
          base_qty_rejected: number | null;
          batch_id: number | null;
          batch_no: string | null;
          created_at: string;
          created_by: string | null;
          expiry_date: string | null;
          id: number;
          line_no: number;
          mfg_date: string | null;
          qty_received: number;
          qty_rejected: number;
          receipt_id: number;
          reject_reason: string | null;
          sku_id: number;
          uom_id: number;
          updated_at: string;
        };
        Insert: {
          base_qty_accepted?: number | null;
          base_qty_rejected?: number | null;
          batch_id?: number | null;
          batch_no?: string | null;
          created_at?: string;
          created_by?: string | null;
          expiry_date?: string | null;
          id?: never;
          line_no?: number;
          mfg_date?: string | null;
          qty_received: number;
          qty_rejected?: number;
          receipt_id: number;
          reject_reason?: string | null;
          sku_id: number;
          uom_id: number;
          updated_at?: string;
        };
        Update: {
          base_qty_accepted?: number | null;
          base_qty_rejected?: number | null;
          batch_id?: number | null;
          batch_no?: string | null;
          created_at?: string;
          created_by?: string | null;
          expiry_date?: string | null;
          id?: never;
          line_no?: number;
          mfg_date?: string | null;
          qty_received?: number;
          qty_rejected?: number;
          receipt_id?: number;
          reject_reason?: string | null;
          sku_id?: number;
          uom_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_goods_receipt_lines_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "m_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_goods_receipt_lines_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_goods_receipt_lines_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "t_goods_receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_goods_receipt_lines_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_goods_receipt_lines_uom_id_fkey";
            columns: ["uom_id"];
            isOneToOne: false;
            referencedRelation: "m_uoms";
            referencedColumns: ["id"];
          },
        ];
      };
      t_goods_receipts: {
        Row: {
          created_at: string;
          created_by: string | null;
          customer_id: number | null;
          gr_no: string;
          id: number;
          note: string | null;
          owner_id: number;
          posted_at: string | null;
          posted_by: string | null;
          receipt_date: string;
          reference_no: string | null;
          source_type: string;
          status: string;
          supplier_id: number | null;
          updated_at: string;
          warehouse_id: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          customer_id?: number | null;
          gr_no?: string;
          id?: never;
          note?: string | null;
          owner_id: number;
          posted_at?: string | null;
          posted_by?: string | null;
          receipt_date?: string;
          reference_no?: string | null;
          source_type?: string;
          status?: string;
          supplier_id?: number | null;
          updated_at?: string;
          warehouse_id: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          customer_id?: number | null;
          gr_no?: string;
          id?: never;
          note?: string | null;
          owner_id?: number;
          posted_at?: string | null;
          posted_by?: string | null;
          receipt_date?: string;
          reference_no?: string | null;
          source_type?: string;
          status?: string;
          supplier_id?: number | null;
          updated_at?: string;
          warehouse_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_goods_receipts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_goods_receipts_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "m_customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_goods_receipts_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_goods_receipts_posted_by_fkey";
            columns: ["posted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_goods_receipts_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "m_suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_goods_receipts_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      t_notifications: {
        Row: {
          body: string | null;
          created_at: string;
          id: number;
          is_read: boolean;
          link: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: never;
          is_read?: boolean;
          link?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: never;
          is_read?: boolean;
          link?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_pick_list_lines: {
        Row: {
          balance_id: number;
          batch_id: number | null;
          id: number;
          location_id: number;
          order_line_id: number;
          pick_list_id: number;
          picked_at: string | null;
          picked_by: string | null;
          picked_request_id: string | null;
          qty: number;
          qty_picked: number;
          seq: number;
          short_reason: string | null;
          sku_id: number;
          status: string;
        };
        Insert: {
          balance_id: number;
          batch_id?: number | null;
          id?: never;
          location_id: number;
          order_line_id: number;
          pick_list_id: number;
          picked_at?: string | null;
          picked_by?: string | null;
          picked_request_id?: string | null;
          qty: number;
          qty_picked?: number;
          seq: number;
          short_reason?: string | null;
          sku_id: number;
          status?: string;
        };
        Update: {
          balance_id?: number;
          batch_id?: number | null;
          id?: never;
          location_id?: number;
          order_line_id?: number;
          pick_list_id?: number;
          picked_at?: string | null;
          picked_by?: string | null;
          picked_request_id?: string | null;
          qty?: number;
          qty_picked?: number;
          seq?: number;
          short_reason?: string | null;
          sku_id?: number;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_pick_list_lines_balance_id_fkey";
            columns: ["balance_id"];
            isOneToOne: false;
            referencedRelation: "t_stock_balances";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_pick_list_lines_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "m_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_pick_list_lines_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_pick_list_lines_order_line_id_fkey";
            columns: ["order_line_id"];
            isOneToOne: false;
            referencedRelation: "t_sales_order_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_pick_list_lines_pick_list_id_fkey";
            columns: ["pick_list_id"];
            isOneToOne: false;
            referencedRelation: "t_pick_lists";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_pick_list_lines_picked_by_fkey";
            columns: ["picked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_pick_list_lines_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
        ];
      };
      t_pick_lists: {
        Row: {
          completed_at: string | null;
          created_at: string;
          created_by: string | null;
          id: number;
          pick_no: string;
          status: string;
          warehouse_id: number;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          pick_no?: string;
          status?: string;
          warehouse_id: number;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: never;
          pick_no?: string;
          status?: string;
          warehouse_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_pick_lists_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_pick_lists_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      t_putaway_tasks: {
        Row: {
          actual_location_id: number | null;
          batch_id: number | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          from_location_id: number;
          id: number;
          qty: number;
          qty_done: number;
          receipt_id: number | null;
          receipt_line_id: number | null;
          sku_id: number;
          status: string;
          suggested_location_id: number | null;
          warehouse_id: number;
        };
        Insert: {
          actual_location_id?: number | null;
          batch_id?: number | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          from_location_id: number;
          id?: never;
          qty: number;
          qty_done?: number;
          receipt_id?: number | null;
          receipt_line_id?: number | null;
          sku_id: number;
          status?: string;
          suggested_location_id?: number | null;
          warehouse_id: number;
        };
        Update: {
          actual_location_id?: number | null;
          batch_id?: number | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          from_location_id?: number;
          id?: never;
          qty?: number;
          qty_done?: number;
          receipt_id?: number | null;
          receipt_line_id?: number | null;
          sku_id?: number;
          status?: string;
          suggested_location_id?: number | null;
          warehouse_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_putaway_tasks_actual_location_id_fkey";
            columns: ["actual_location_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_putaway_tasks_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "m_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_putaway_tasks_completed_by_fkey";
            columns: ["completed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_putaway_tasks_from_location_id_fkey";
            columns: ["from_location_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_putaway_tasks_receipt_id_fkey";
            columns: ["receipt_id"];
            isOneToOne: false;
            referencedRelation: "t_goods_receipts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_putaway_tasks_receipt_line_id_fkey";
            columns: ["receipt_line_id"];
            isOneToOne: false;
            referencedRelation: "t_goods_receipt_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_putaway_tasks_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_putaway_tasks_suggested_location_id_fkey";
            columns: ["suggested_location_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_putaway_tasks_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      t_receipt_line_costs: {
        Row: {
          currency: string;
          receipt_line_id: number;
          unit_cost: number;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          currency?: string;
          receipt_line_id: number;
          unit_cost: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          currency?: string;
          receipt_line_id?: number;
          unit_cost?: number;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "t_receipt_line_costs_receipt_line_id_fkey";
            columns: ["receipt_line_id"];
            isOneToOne: true;
            referencedRelation: "t_goods_receipt_lines";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_receipt_line_costs_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_role_permissions: {
        Row: {
          can_create: boolean;
          can_delete: boolean;
          can_read: boolean;
          can_update: boolean;
          feature_id: number;
          id: number;
          role_id: number;
        };
        Insert: {
          can_create?: boolean;
          can_delete?: boolean;
          can_read?: boolean;
          can_update?: boolean;
          feature_id: number;
          id?: never;
          role_id: number;
        };
        Update: {
          can_create?: boolean;
          can_delete?: boolean;
          can_read?: boolean;
          can_update?: boolean;
          feature_id?: number;
          id?: never;
          role_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_role_permissions_feature_id_fkey";
            columns: ["feature_id"];
            isOneToOne: false;
            referencedRelation: "m_features";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_role_permissions_role_id_fkey";
            columns: ["role_id"];
            isOneToOne: false;
            referencedRelation: "m_roles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_sales_order_lines: {
        Row: {
          base_qty: number;
          created_at: string;
          id: number;
          line_no: number;
          order_id: number;
          qty: number;
          qty_allocated: number;
          qty_picked: number;
          sku_id: number;
          uom_id: number;
          updated_at: string;
        };
        Insert: {
          base_qty?: number;
          created_at?: string;
          id?: never;
          line_no?: number;
          order_id: number;
          qty: number;
          qty_allocated?: number;
          qty_picked?: number;
          sku_id: number;
          uom_id: number;
          updated_at?: string;
        };
        Update: {
          base_qty?: number;
          created_at?: string;
          id?: never;
          line_no?: number;
          order_id?: number;
          qty?: number;
          qty_allocated?: number;
          qty_picked?: number;
          sku_id?: number;
          uom_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_sales_order_lines_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "t_sales_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_sales_order_lines_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_sales_order_lines_uom_id_fkey";
            columns: ["uom_id"];
            isOneToOne: false;
            referencedRelation: "m_uoms";
            referencedColumns: ["id"];
          },
        ];
      };
      t_sales_orders: {
        Row: {
          channel: string;
          created_at: string;
          created_by: string | null;
          customer_id: number | null;
          customer_name: string;
          id: number;
          note: string | null;
          order_date: string;
          owner_id: number;
          reference_no: string | null;
          ship_to: string | null;
          so_no: string;
          status: string;
          updated_at: string;
          warehouse_id: number;
        };
        Insert: {
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: number | null;
          customer_name: string;
          id?: never;
          note?: string | null;
          order_date?: string;
          owner_id: number;
          reference_no?: string | null;
          ship_to?: string | null;
          so_no?: string;
          status?: string;
          updated_at?: string;
          warehouse_id: number;
        };
        Update: {
          channel?: string;
          created_at?: string;
          created_by?: string | null;
          customer_id?: number | null;
          customer_name?: string;
          id?: never;
          note?: string | null;
          order_date?: string;
          owner_id?: number;
          reference_no?: string | null;
          ship_to?: string | null;
          so_no?: string;
          status?: string;
          updated_at?: string;
          warehouse_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_sales_orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_sales_orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "m_customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_sales_orders_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_sales_orders_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      t_shipment_items: {
        Row: {
          batch_id: number | null;
          id: number;
          qty: number;
          shipment_id: number;
          sku_id: number;
        };
        Insert: {
          batch_id?: number | null;
          id?: never;
          qty: number;
          shipment_id: number;
          sku_id: number;
        };
        Update: {
          batch_id?: number | null;
          id?: never;
          qty?: number;
          shipment_id?: number;
          sku_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_shipment_items_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "m_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_shipment_items_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "t_shipments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_shipment_items_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
        ];
      };
      t_shipments: {
        Row: {
          courier: string | null;
          dimensions: string | null;
          dispatched_at: string | null;
          dispatched_by: string | null;
          do_no: string;
          id: number;
          order_id: number;
          packages: number;
          packed_at: string;
          packed_by: string | null;
          status: string;
          tracking_no: string | null;
          warehouse_id: number;
          weight_kg: number | null;
        };
        Insert: {
          courier?: string | null;
          dimensions?: string | null;
          dispatched_at?: string | null;
          dispatched_by?: string | null;
          do_no?: string;
          id?: never;
          order_id: number;
          packages?: number;
          packed_at?: string;
          packed_by?: string | null;
          status?: string;
          tracking_no?: string | null;
          warehouse_id: number;
          weight_kg?: number | null;
        };
        Update: {
          courier?: string | null;
          dimensions?: string | null;
          dispatched_at?: string | null;
          dispatched_by?: string | null;
          do_no?: string;
          id?: never;
          order_id?: number;
          packages?: number;
          packed_at?: string;
          packed_by?: string | null;
          status?: string;
          tracking_no?: string | null;
          warehouse_id?: number;
          weight_kg?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "t_shipments_dispatched_by_fkey";
            columns: ["dispatched_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_shipments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "t_sales_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_shipments_packed_by_fkey";
            columns: ["packed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_shipments_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      t_stock_balances: {
        Row: {
          batch_id: number | null;
          id: number;
          location_id: number;
          owner_id: number;
          qty_on_hand: number;
          qty_reserved: number;
          sku_id: number;
          updated_at: string;
          warehouse_id: number;
        };
        Insert: {
          batch_id?: number | null;
          id?: never;
          location_id: number;
          owner_id: number;
          qty_on_hand?: number;
          qty_reserved?: number;
          sku_id: number;
          updated_at?: string;
          warehouse_id: number;
        };
        Update: {
          batch_id?: number | null;
          id?: never;
          location_id?: number;
          owner_id?: number;
          qty_on_hand?: number;
          qty_reserved?: number;
          sku_id?: number;
          updated_at?: string;
          warehouse_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_stock_balances_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "m_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_balances_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_balances_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_balances_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_balances_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      t_stock_count_counters: {
        Row: {
          count_id: number;
          first_counted_at: string;
          user_id: string;
        };
        Insert: {
          count_id: number;
          first_counted_at?: string;
          user_id: string;
        };
        Update: {
          count_id?: number;
          first_counted_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_stock_count_counters_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "t_stock_counts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_count_counters_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_stock_count_lines: {
        Row: {
          batch_id: number | null;
          count_id: number;
          counted_at: string | null;
          counted_by: string | null;
          counted_qty: number | null;
          id: number;
          location_id: number;
          owner_id: number;
          sku_id: number;
          system_qty: number;
        };
        Insert: {
          batch_id?: number | null;
          count_id: number;
          counted_at?: string | null;
          counted_by?: string | null;
          counted_qty?: number | null;
          id?: never;
          location_id: number;
          owner_id: number;
          sku_id: number;
          system_qty?: number;
        };
        Update: {
          batch_id?: number | null;
          count_id?: number;
          counted_at?: string | null;
          counted_by?: string | null;
          counted_qty?: number | null;
          id?: never;
          location_id?: number;
          owner_id?: number;
          sku_id?: number;
          system_qty?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_stock_count_lines_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "m_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_count_lines_count_id_fkey";
            columns: ["count_id"];
            isOneToOne: false;
            referencedRelation: "t_stock_counts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_count_lines_counted_by_fkey";
            columns: ["counted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_count_lines_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_count_lines_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_count_lines_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
        ];
      };
      t_stock_counts: {
        Row: {
          blind: boolean;
          count_no: string;
          created_at: string;
          created_by: string | null;
          decided_at: string | null;
          decided_by: string | null;
          id: number;
          note: string | null;
          reject_reason: string | null;
          scope_category_id: number | null;
          scope_location_ids: number[];
          started_at: string | null;
          status: string;
          submitted_at: string | null;
          submitted_by: string | null;
          warehouse_id: number;
        };
        Insert: {
          blind?: boolean;
          count_no?: string;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: never;
          note?: string | null;
          reject_reason?: string | null;
          scope_category_id?: number | null;
          scope_location_ids?: number[];
          started_at?: string | null;
          status?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          warehouse_id: number;
        };
        Update: {
          blind?: boolean;
          count_no?: string;
          created_at?: string;
          created_by?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: never;
          note?: string | null;
          reject_reason?: string | null;
          scope_category_id?: number | null;
          scope_location_ids?: number[];
          started_at?: string | null;
          status?: string;
          submitted_at?: string | null;
          submitted_by?: string | null;
          warehouse_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_stock_counts_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_counts_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_counts_scope_category_id_fkey";
            columns: ["scope_category_id"];
            isOneToOne: false;
            referencedRelation: "m_categories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_counts_submitted_by_fkey";
            columns: ["submitted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_counts_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      t_stock_movements: {
        Row: {
          batch_id: number | null;
          created_at: string;
          created_by: string | null;
          from_location_id: number | null;
          id: number;
          movement_date: string;
          movement_type: string;
          note: string | null;
          owner_id: number;
          qty: number;
          ref_id: number | null;
          ref_no: string | null;
          ref_type: string | null;
          request_id: string | null;
          sku_id: number;
          to_location_id: number | null;
        };
        Insert: {
          batch_id?: number | null;
          created_at?: string;
          created_by?: string | null;
          from_location_id?: number | null;
          id?: never;
          movement_date?: string;
          movement_type: string;
          note?: string | null;
          owner_id?: number;
          qty: number;
          ref_id?: number | null;
          ref_no?: string | null;
          ref_type?: string | null;
          request_id?: string | null;
          sku_id: number;
          to_location_id?: number | null;
        };
        Update: {
          batch_id?: number | null;
          created_at?: string;
          created_by?: string | null;
          from_location_id?: number | null;
          id?: never;
          movement_date?: string;
          movement_type?: string;
          note?: string | null;
          owner_id?: number;
          qty?: number;
          ref_id?: number | null;
          ref_no?: string | null;
          ref_type?: string | null;
          request_id?: string | null;
          sku_id?: number;
          to_location_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "t_stock_movements_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "m_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_movements_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_movements_from_location_id_fkey";
            columns: ["from_location_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_movements_owner_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_movements_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_movements_to_location_id_fkey";
            columns: ["to_location_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
        ];
      };
      t_stock_transfer_lines: {
        Row: {
          batch_id: number | null;
          from_location_id: number;
          id: number;
          qty: number;
          qty_received: number | null;
          sku_id: number;
          to_location_id: number | null;
          transfer_id: number;
          variance_decided_at: string | null;
          variance_decided_by: string | null;
          variance_reason: string | null;
          variance_status: string;
        };
        Insert: {
          batch_id?: number | null;
          from_location_id: number;
          id?: never;
          qty: number;
          qty_received?: number | null;
          sku_id: number;
          to_location_id?: number | null;
          transfer_id: number;
          variance_decided_at?: string | null;
          variance_decided_by?: string | null;
          variance_reason?: string | null;
          variance_status?: string;
        };
        Update: {
          batch_id?: number | null;
          from_location_id?: number;
          id?: never;
          qty?: number;
          qty_received?: number | null;
          sku_id?: number;
          to_location_id?: number | null;
          transfer_id?: number;
          variance_decided_at?: string | null;
          variance_decided_by?: string | null;
          variance_reason?: string | null;
          variance_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_stock_transfer_lines_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "m_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_transfer_lines_from_location_id_fkey";
            columns: ["from_location_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_transfer_lines_sku_id_fkey";
            columns: ["sku_id"];
            isOneToOne: false;
            referencedRelation: "m_skus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_transfer_lines_to_location_id_fkey";
            columns: ["to_location_id"];
            isOneToOne: false;
            referencedRelation: "m_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_transfer_lines_transfer_id_fkey";
            columns: ["transfer_id"];
            isOneToOne: false;
            referencedRelation: "t_stock_transfers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_transfer_lines_variance_decided_by_fkey";
            columns: ["variance_decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_stock_transfers: {
        Row: {
          created_at: string;
          created_by: string | null;
          from_warehouse_id: number;
          id: number;
          note: string | null;
          received_at: string | null;
          received_by: string | null;
          sent_at: string | null;
          sent_by: string | null;
          status: string;
          to_warehouse_id: number;
          transfer_no: string;
          transfer_type: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          from_warehouse_id: number;
          id?: never;
          note?: string | null;
          received_at?: string | null;
          received_by?: string | null;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          to_warehouse_id: number;
          transfer_no?: string;
          transfer_type: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          from_warehouse_id?: number;
          id?: never;
          note?: string | null;
          received_at?: string | null;
          received_by?: string | null;
          sent_at?: string | null;
          sent_by?: string | null;
          status?: string;
          to_warehouse_id?: number;
          transfer_no?: string;
          transfer_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_stock_transfers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_transfers_from_warehouse_id_fkey";
            columns: ["from_warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_transfers_received_by_fkey";
            columns: ["received_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_transfers_sent_by_fkey";
            columns: ["sent_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_transfers_to_warehouse_id_fkey";
            columns: ["to_warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      t_stock_value_snapshots: {
        Row: {
          owner_id: number;
          snapshot_date: string;
          total_value: number;
          warehouse_id: number;
        };
        Insert: {
          owner_id: number;
          snapshot_date: string;
          total_value: number;
          warehouse_id: number;
        };
        Update: {
          owner_id?: number;
          snapshot_date?: string;
          total_value?: number;
          warehouse_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_stock_value_snapshots_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "m_owners";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_stock_value_snapshots_warehouse_id_fkey";
            columns: ["warehouse_id"];
            isOneToOne: false;
            referencedRelation: "m_warehouses";
            referencedColumns: ["id"];
          },
        ];
      };
      t_user_access_override: {
        Row: {
          can_create: boolean | null;
          can_delete: boolean | null;
          can_read: boolean | null;
          can_update: boolean | null;
          created_at: string;
          created_by: string | null;
          feature_id: number;
          id: number;
          is_override_active: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          can_create?: boolean | null;
          can_delete?: boolean | null;
          can_read?: boolean | null;
          can_update?: boolean | null;
          created_at?: string;
          created_by?: string | null;
          feature_id: number;
          id?: never;
          is_override_active?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          can_create?: boolean | null;
          can_delete?: boolean | null;
          can_read?: boolean | null;
          can_update?: boolean | null;
          created_at?: string;
          created_by?: string | null;
          feature_id?: number;
          id?: never;
          is_override_active?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_user_access_override_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_user_access_override_feature_id_fkey";
            columns: ["feature_id"];
            isOneToOne: false;
            referencedRelation: "m_features";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "t_user_access_override_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      t_webhook_deliveries: {
        Row: {
          attempts: number;
          created_at: string;
          delivered_at: string | null;
          event: string;
          id: number;
          last_error: string | null;
          last_status_code: number | null;
          next_attempt_at: string;
          payload: NonNullable<Json>;
          status: string;
          webhook_id: number;
        };
        Insert: {
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          event: string;
          id?: never;
          last_error?: string | null;
          last_status_code?: number | null;
          next_attempt_at?: string;
          payload: NonNullable<Json>;
          status?: string;
          webhook_id: number;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          delivered_at?: string | null;
          event?: string;
          id?: never;
          last_error?: string | null;
          last_status_code?: number | null;
          next_attempt_at?: string;
          payload?: NonNullable<Json>;
          status?: string;
          webhook_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_webhook_deliveries_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: false;
            referencedRelation: "t_webhooks";
            referencedColumns: ["id"];
          },
        ];
      };
      t_webhook_secrets: {
        Row: {
          secret: string;
          webhook_id: number;
        };
        Insert: {
          secret: string;
          webhook_id: number;
        };
        Update: {
          secret?: string;
          webhook_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "t_webhook_secrets_webhook_id_fkey";
            columns: ["webhook_id"];
            isOneToOne: true;
            referencedRelation: "t_webhooks";
            referencedColumns: ["id"];
          },
        ];
      };
      t_webhooks: {
        Row: {
          created_at: string;
          created_by: string | null;
          disabled_reason: string | null;
          events: string[];
          failure_streak: number;
          id: number;
          is_active: boolean;
          updated_at: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          disabled_reason?: string | null;
          events: string[];
          failure_streak?: number;
          id?: never;
          is_active?: boolean;
          updated_at?: string;
          url: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          disabled_reason?: string | null;
          events?: string[];
          failure_streak?: number;
          id?: never;
          is_active?: boolean;
          updated_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "t_webhooks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      api_authenticate: {
        Args: { p_key_hash: string; p_scope: string };
        Returns: Json;
      };
      api_create_order: {
        Args: {
          p_body: Json;
          p_idem_key: string;
          p_key_id: number;
          p_owner_id: number;
        };
        Returns: Json;
      };
      api_products: {
        Args: {
          p_limit: number;
          p_offset: number;
          p_owner_id: number;
          p_updated_since: string;
        };
        Returns: Json;
      };
      api_stock: {
        Args: {
          p_limit: number;
          p_offset: number;
          p_owner_id: number;
          p_sku: string;
          p_warehouse: string;
        };
        Returns: Json;
      };
      approve_stock_count: { Args: { p_id: number }; Returns: undefined };
      approve_transfer_variance: {
        Args: { p_approve: boolean; p_line_id: number };
        Returns: undefined;
      };
      bin_pick_counts: {
        Args: { p_days?: number; p_warehouse_id: number };
        Returns: {
          location_id: number;
          picks: number;
        }[];
      };
      can_approve: { Args: { p_feature: string }; Returns: boolean };
      cancel_goods_receipt: { Args: { p_id: number }; Returns: undefined };
      cancel_pick_list: { Args: { p_id: number }; Returns: undefined };
      cancel_sales_order: { Args: { p_id: number }; Returns: undefined };
      cancel_stock_count: { Args: { p_id: number }; Returns: undefined };
      cancel_stock_transfer: { Args: { p_id: number }; Returns: undefined };
      claim_webhook_deliveries: {
        Args: { p_limit?: number };
        Returns: {
          created_at: string;
          event: string;
          id: number;
          payload: Json;
          secret: string;
          url: string;
          webhook_id: number;
        }[];
      };
      cogs_report: {
        Args: { p_from: string; p_to: string };
        Returns: {
          category_name: string;
          cost_average: number;
          cost_fifo: number;
          kind: string;
          product_name: string;
          qty: number;
          sku_code: string;
          sku_id: number;
        }[];
      };
      company_now_time: { Args: Record<PropertyKey, never>; Returns: string };
      company_today: { Args: Record<PropertyKey, never>; Returns: string };
      complete_putaway: {
        Args: {
          p_location_id: number;
          p_qty: number;
          p_request_id?: string;
          p_task_id: number;
        };
        Returns: number;
      };
      confirm_pick_line: {
        Args: {
          p_line_id: number;
          p_qty: number;
          p_request_id?: string;
          p_short_reason?: string;
        };
        Returns: undefined;
      };
      count_review: {
        Args: { p_id: number };
        Returns: {
          batch_id: number;
          counted_qty: number;
          line_id: number;
          location_id: number;
          sku_id: number;
          system_qty: number;
          variance: number;
          variance_value: number;
        }[];
      };
      count_scope_bins: { Args: { p_count_id: number }; Returns: number[] };
      create_api_key: {
        Args: {
          p_expires_at?: string;
          p_name: string;
          p_owner_id?: number;
          p_scopes: string[];
        };
        Returns: string;
      };
      create_bin_transfer: {
        Args: {
          p_batch_id: number;
          p_from_location_id: number;
          p_note?: string;
          p_qty: number;
          p_sku_id: number;
          p_to_location_id: number;
        };
        Returns: number;
      };
      create_product_with_skus: { Args: { payload: Json }; Returns: number };
      create_webhook: {
        Args: { p_events: string[]; p_url: string };
        Returns: Json;
      };
      dashboard_summary: { Args: { p_warehouse_id?: number }; Returns: Json };
      demo_act: {
        Args: { p_date: string; p_user: string };
        Returns: undefined;
      };
      demo_ean13: { Args: { p12: string }; Returns: string };
      demo_free: { Args: { p_sku: number; p_wh: number }; Returns: number };
      demo_order: {
        Args: {
          p_customer: number;
          p_lines: Json;
          p_manager: string;
          p_owner: number;
          p_stage: string;
          p_wh: number;
          p_worker: string;
        };
        Returns: number;
      };
      demo_receive: {
        Args: {
          p_customer?: number;
          p_lines: Json;
          p_owner: number;
          p_putaway?: boolean;
          p_ref?: string;
          p_supplier: number;
          p_user: string;
          p_wh: number;
        };
        Returns: number;
      };
      dispatch_shipment: {
        Args: { p_courier: string; p_id: number; p_tracking_no?: string };
        Returns: undefined;
      };
      dispatch_webhooks: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      enqueue_webhook_event: {
        Args: { p_data: Json; p_event: string };
        Returns: undefined;
      };
      ensure_default_admin: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      ensure_location: {
        Args: {
          p_code: string;
          p_level: string;
          p_parent_id: number;
          p_warehouse_id: number;
        };
        Returns: number;
      };
      estimated_receipt_lines: {
        Args: Record<PropertyKey, never>;
        Returns: {
          gr_no: string;
          qty: number;
          receipt_date: string;
          receipt_line_id: number;
          sku_id: number;
          unit_cost: number;
          uom_id: number;
        }[];
      };
      generate_bins: {
        Args: {
          p_aisles: string[];
          p_bin_type?: string;
          p_levels: string[];
          p_max_qty?: number;
          p_max_weight_kg?: number;
          p_racks: number;
          p_warehouse_id: number;
          p_zone: string;
        };
        Returns: number;
      };
      generate_pick_list: { Args: { p_order_ids: number[] }; Returns: number };
      get_users_with_email: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avatar_url: string;
          banned_until: string;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_superadmin: boolean;
          role_id: number;
          role_name: string;
        }[];
      };
      has_any_access: { Args: Record<PropertyKey, never>; Returns: boolean };
      has_permission: {
        Args: { p_action: string; p_feature_key: string };
        Returns: boolean;
      };
      import_products: { Args: { p_rows: Json }; Returns: number };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_superadmin: { Args: Record<PropertyKey, never>; Returns: boolean };
      log_client_error: {
        Args: { p_context?: Json; p_message: string; p_source: string };
        Returns: undefined;
      };
      my_rank: { Args: Record<PropertyKey, never>; Returns: number };
      next_doc_no: { Args: { p_prefix: string }; Returns: string };
      order_is_editable: { Args: { p_order_id: number }; Returns: boolean };
      outranks: { Args: { p_user_id: string }; Returns: boolean };
      pack_shipment: {
        Args: {
          p_dimensions?: string;
          p_items: Json;
          p_order_id: number;
          p_packages?: number;
          p_weight_kg: number;
        };
        Returns: number;
      };
      period_is_locked: { Args: { p_date: string }; Returns: boolean };
      post_goods_receipt: { Args: { p_id: number }; Returns: undefined };
      post_stock_movement: {
        Args: {
          p_batch_id?: number;
          p_from_location_id?: number;
          p_movement_date?: string;
          p_note?: string;
          p_qty: number;
          p_ref_id?: number;
          p_ref_no?: string;
          p_ref_type?: string;
          p_request_id?: string;
          p_sku_id: number;
          p_to_location_id?: number;
          p_type: string;
          p_unit_cost?: number;
        };
        Returns: number;
      };
      public_demo_mode: { Args: Record<PropertyKey, never>; Returns: boolean };
      receipt_is_draft: { Args: { p_receipt_id: number }; Returns: boolean };
      receipt_line_is_draft: { Args: { p_line_id: number }; Returns: boolean };
      receive_transfer: {
        Args: { p_id: number; p_lines: Json };
        Returns: undefined;
      };
      record_count: {
        Args: {
          p_batch_id: number;
          p_count_id: number;
          p_location_id: number;
          p_qty: number;
          p_sku_id: number;
        };
        Returns: undefined;
      };
      record_webhook_result: {
        Args: {
          p_error: string;
          p_id: number;
          p_ok: boolean;
          p_status_code: number;
        };
        Returns: undefined;
      };
      refresh_order_status: {
        Args: { p_order_id: number };
        Returns: undefined;
      };
      reject_stock_count: {
        Args: { p_id: number; p_reason: string };
        Returns: undefined;
      };
      retry_webhook_delivery: { Args: { p_id: number }; Returns: undefined };
      revalue_receipt: {
        Args: { p_receipt_line_id: number; p_unit_cost: number };
        Returns: undefined;
      };
      revoke_api_key: { Args: { p_id: number }; Returns: undefined };
      rotate_webhook_secret: { Args: { p_id: number }; Returns: string };
      run_daily_jobs: { Args: Record<PropertyKey, never>; Returns: undefined };
      run_housekeeping: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      run_queued_demo_seed: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      seed_demo_data: { Args: Record<PropertyKey, never>; Returns: Json };
      seed_demo_extras: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      send_transfer: { Args: { p_id: number }; Returns: undefined };
      set_locked_until: { Args: { p_date: string }; Returns: undefined };
      set_receipt_costs: {
        Args: { p_costs: Json; p_receipt_id: number };
        Returns: undefined;
      };
      sidebar_counts: { Args: { p_warehouse_id?: number }; Returns: Json };
      snapshot_stock_value: { Args: { p_date?: string }; Returns: undefined };
      start_stock_count: { Args: { p_id: number }; Returns: undefined };
      stock_card: {
        Args: {
          p_from: string;
          p_sku_id: number;
          p_to: string;
          p_warehouse_id?: number;
        };
        Returns: {
          balance: number;
          batch_no: string;
          from_code: string;
          movement_date: string;
          movement_id: number;
          movement_type: string;
          note: string;
          qty_in: number;
          qty_out: number;
          ref_no: string;
          to_code: string;
        }[];
      };
      stock_valuation: {
        Args: { p_as_of?: string; p_method?: string; p_warehouse_id?: number };
        Returns: {
          category_name: string;
          owner_id: number;
          owner_name: string;
          owner_type: string;
          product_name: string;
          qty: number;
          sku_code: string;
          sku_id: number;
          unit_cost: number;
          value: number;
          warehouse_code: string;
          warehouse_id: number;
        }[];
      };
      submit_stock_count: { Args: { p_id: number }; Returns: undefined };
      suggest_putaway_bins: {
        Args: {
          p_batch_id?: number;
          p_qty: number;
          p_sku_id: number;
          p_warehouse_id: number;
        };
        Returns: {
          free_qty: number;
          full_code: string;
          location_id: number;
          pick_sequence: number;
          rank: number;
        }[];
      };
      superadmin_bootstrap: {
        Args: { p_email: string; p_password: string };
        Returns: string;
      };
      superadmin_monitor: { Args: Record<PropertyKey, never>; Returns: Json };
      superadmin_seed_demo_data: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      superadmin_stats: { Args: Record<PropertyKey, never>; Returns: Json };
      superadmin_wipe_all_data: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      transfer_is_draft: { Args: { p_id: number }; Returns: boolean };
      upsert_login: {
        Args: {
          p_email: string;
          p_full_name: string;
          p_id: string;
          p_password: string;
          p_role: string;
        };
        Returns: string;
      };
      valuation_rows: {
        Args: { p_as_of: string; p_method: string; p_warehouse_id?: number };
        Returns: {
          owner_id: number;
          qty: number;
          sku_id: number;
          unit_cost: number;
          value: number;
          warehouse_id: number;
        }[];
      };
      warehouse_network: { Args: Record<PropertyKey, never>; Returns: Json };
      wipe_all_data: { Args: Record<PropertyKey, never>; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
