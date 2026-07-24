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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_variable_config: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_enabled: boolean | null
          is_system: boolean | null
          key: string
          label: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          is_system?: boolean | null
          key: string
          label: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          is_system?: boolean | null
          key?: string
          label?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      advisor_daily_invoices: {
        Row: {
          advisor_code: string
          created_at: string | null
          entered_by: string | null
          id: string
          invoice_count: number
          invoice_date: string
          profile_id: string | null
        }
        Insert: {
          advisor_code: string
          created_at?: string | null
          entered_by?: string | null
          id?: string
          invoice_count?: number
          invoice_date: string
          profile_id?: string | null
        }
        Update: {
          advisor_code?: string
          created_at?: string | null
          entered_by?: string | null
          id?: string
          invoice_count?: number
          invoice_date?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advisor_daily_invoices_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisor_daily_invoices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      advisor_monthly_baseline: {
        Row: {
          advisor_code: string
          baseline_count: number
          id: string
          month: string
          profile_id: string | null
          set_at: string | null
          set_by: string | null
        }
        Insert: {
          advisor_code: string
          baseline_count?: number
          id?: string
          month: string
          profile_id?: string | null
          set_at?: string | null
          set_by?: string | null
        }
        Update: {
          advisor_code?: string
          baseline_count?: number
          id?: string
          month?: string
          profile_id?: string | null
          set_at?: string | null
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advisor_monthly_baseline_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisor_monthly_baseline_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string | null
          appointment_number: string
          appointment_time: string | null
          booked_by: string | null
          coupon_code: string
          coupon_id: string | null
          created_at: string | null
          customer_mobile: string | null
          follow_up_note: string | null
          id: string
          invoice_number: string | null
          not_reachable_count: number | null
          notes: string | null
          offer_id: string | null
          redeemed_plate: string | null
          reschedule_count: number | null
          status: string
          sub_offer_id: string | null
          sub_offer_name: string | null
          updated_at: string | null
          vehicle_make: string | null
          vehicle_plate: string | null
          vehicle_year: number | null
          wa_confirmation_sent: boolean | null
        }
        Insert: {
          appointment_date?: string | null
          appointment_number?: string
          appointment_time?: string | null
          booked_by?: string | null
          coupon_code: string
          coupon_id?: string | null
          created_at?: string | null
          customer_mobile?: string | null
          follow_up_note?: string | null
          id?: string
          invoice_number?: string | null
          not_reachable_count?: number | null
          notes?: string | null
          offer_id?: string | null
          redeemed_plate?: string | null
          reschedule_count?: number | null
          status?: string
          sub_offer_id?: string | null
          sub_offer_name?: string | null
          updated_at?: string | null
          vehicle_make?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
          wa_confirmation_sent?: boolean | null
        }
        Update: {
          appointment_date?: string | null
          appointment_number?: string
          appointment_time?: string | null
          booked_by?: string | null
          coupon_code?: string
          coupon_id?: string | null
          created_at?: string | null
          customer_mobile?: string | null
          follow_up_note?: string | null
          id?: string
          invoice_number?: string | null
          not_reachable_count?: number | null
          notes?: string | null
          offer_id?: string | null
          redeemed_plate?: string | null
          reschedule_count?: number | null
          status?: string
          sub_offer_id?: string | null
          sub_offer_name?: string | null
          updated_at?: string | null
          vehicle_make?: string | null
          vehicle_plate?: string | null
          vehicle_year?: number | null
          wa_confirmation_sent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_sub_offer_id_fkey"
            columns: ["sub_offer_id"]
            isOneToOne: false
            referencedRelation: "sub_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_config: {
        Row: {
          campaign_name: string
          coupon_cap: number | null
          created_at: string | null
          distribution_window_days: number | null
          first_batch_target: number | null
          id: string
          is_locked: boolean | null
          post_100_offer_option: string | null
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          campaign_name?: string
          coupon_cap?: number | null
          created_at?: string | null
          distribution_window_days?: number | null
          first_batch_target?: number | null
          id?: string
          is_locked?: boolean | null
          post_100_offer_option?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          campaign_name?: string
          coupon_cap?: number | null
          created_at?: string | null
          distribution_window_days?: number | null
          first_batch_target?: number | null
          id?: string
          is_locked?: boolean | null
          post_100_offer_option?: string | null
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      coupon_activity_log: {
        Row: {
          action: string | null
          coupon_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          performed_by: string | null
        }
        Insert: {
          action?: string | null
          coupon_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
        }
        Update: {
          action?: string | null
          coupon_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_activity_log_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_activity_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_commission_splits: {
        Row: {
          advisor_amount: number
          advisor_code: string
          advisor_name: string
          coupon_id: string
          created_at: string | null
          id: string
          offer_id: string
          receptionist_amount: number
          receptionist_id: string
          total_commission_amount: number
        }
        Insert: {
          advisor_amount: number
          advisor_code: string
          advisor_name: string
          coupon_id: string
          created_at?: string | null
          id?: string
          offer_id: string
          receptionist_amount: number
          receptionist_id: string
          total_commission_amount: number
        }
        Update: {
          advisor_amount?: number
          advisor_code?: string
          advisor_name?: string
          coupon_id?: string
          created_at?: string | null
          id?: string
          offer_id?: string
          receptionist_amount?: number
          receptionist_id?: string
          total_commission_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupon_commission_splits_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: true
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_commission_splits_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_commission_splits_receptionist_id_fkey"
            columns: ["receptionist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_follow_ups: {
        Row: {
          coupon_id: string
          created_at: string
          follow_up_status: string
          followed_up_by: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          follow_up_status?: string
          followed_up_by: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          follow_up_status?: string
          followed_up_by?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_follow_ups_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_follow_ups_followed_up_by_fkey"
            columns: ["followed_up_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          advisor_code: string | null
          advisor_name: string | null
          car_model: string | null
          coupon_code: string
          coupon_type: string | null
          created_at: string | null
          created_by_receptionist: boolean | null
          customer_name: string | null
          customer_status: string | null
          expiry_date: string | null
          id: string
          identifier_type: string | null
          image_file_path: string | null
          invoice_number: string | null
          is_archived: boolean | null
          issue_date: string | null
          issued_by: string | null
          last_notified_at: string | null
          minor_service_redeemed: boolean | null
          mobile_number: string | null
          offer_id: string | null
          offer_identifier: string | null
          offer_title: string | null
          parent_coupon_id: string | null
          plate_category: string | null
          plate_combined_string: string | null
          plate_number: string | null
          plate_region: string | null
          redemption_count: number | null
          sequence_number: number | null
          stage: number | null
          stage_updated_at: string | null
          status: string | null
          template_id: string | null
          updated_at: string | null
          valid_days: number | null
        }
        Insert: {
          advisor_code?: string | null
          advisor_name?: string | null
          car_model?: string | null
          coupon_code: string
          coupon_type?: string | null
          created_at?: string | null
          created_by_receptionist?: boolean | null
          customer_name?: string | null
          customer_status?: string | null
          expiry_date?: string | null
          id?: string
          identifier_type?: string | null
          image_file_path?: string | null
          invoice_number?: string | null
          is_archived?: boolean | null
          issue_date?: string | null
          issued_by?: string | null
          last_notified_at?: string | null
          minor_service_redeemed?: boolean | null
          mobile_number?: string | null
          offer_id?: string | null
          offer_identifier?: string | null
          offer_title?: string | null
          parent_coupon_id?: string | null
          plate_category?: string | null
          plate_combined_string?: string | null
          plate_number?: string | null
          plate_region?: string | null
          redemption_count?: number | null
          sequence_number?: number | null
          stage?: number | null
          stage_updated_at?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          valid_days?: number | null
        }
        Update: {
          advisor_code?: string | null
          advisor_name?: string | null
          car_model?: string | null
          coupon_code?: string
          coupon_type?: string | null
          created_at?: string | null
          created_by_receptionist?: boolean | null
          customer_name?: string | null
          customer_status?: string | null
          expiry_date?: string | null
          id?: string
          identifier_type?: string | null
          image_file_path?: string | null
          invoice_number?: string | null
          is_archived?: boolean | null
          issue_date?: string | null
          issued_by?: string | null
          last_notified_at?: string | null
          minor_service_redeemed?: boolean | null
          mobile_number?: string | null
          offer_id?: string | null
          offer_identifier?: string | null
          offer_title?: string | null
          parent_coupon_id?: string | null
          plate_category?: string | null
          plate_combined_string?: string | null
          plate_number?: string | null
          plate_region?: string | null
          redemption_count?: number | null
          sequence_number?: number | null
          stage?: number | null
          stage_updated_at?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          valid_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_parent_coupon_id_fkey"
            columns: ["parent_coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      emirates_config: {
        Row: {
          categories: string[]
          code: string
          created_at: string | null
          id: string
          is_enabled: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          categories?: string[]
          code: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          categories?: string[]
          code?: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      loyalty_customers: {
        Row: {
          car_make: string | null
          car_model: string | null
          created_at: string | null
          customer_id: string
          email: string | null
          full_name: string | null
          id: string
          mobile_number: string
          plate_numbers: string[]
          updated_at: string | null
        }
        Insert: {
          car_make?: string | null
          car_model?: string | null
          created_at?: string | null
          customer_id: string
          email?: string | null
          full_name?: string | null
          id?: string
          mobile_number: string
          plate_numbers?: string[]
          updated_at?: string | null
        }
        Update: {
          car_make?: string | null
          car_model?: string | null
          created_at?: string | null
          customer_id?: string
          email?: string | null
          full_name?: string | null
          id?: string
          mobile_number?: string
          plate_numbers?: string[]
          updated_at?: string | null
        }
        Relationships: []
      }
      offer_stages: {
        Row: {
          bmw_visits_required: number
          created_at: string | null
          id: string
          offer_id: string
          reward_description: string | null
          reward_label: string
          stage_number: number
        }
        Insert: {
          bmw_visits_required: number
          created_at?: string | null
          id?: string
          offer_id: string
          reward_description?: string | null
          reward_label: string
          stage_number: number
        }
        Update: {
          bmw_visits_required?: number
          created_at?: string | null
          id?: string
          offer_id?: string
          reward_description?: string | null
          reward_label?: string
          stage_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_stages_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_whatsapp_templates: {
        Row: {
          created_at: string | null
          id: string
          message_body: string
          offer_id: string
          trigger_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_body: string
          offer_id: string
          trigger_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_body?: string
          offer_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_whatsapp_templates_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          activated_at: string | null
          b_redemption_end_date: string | null
          b_redemption_start_date: string | null
          b_redemption_window_type: string | null
          b_valid_days: number | null
          commission_amount: number | null
          coupon_cap: number | null
          coupon_code_structure: string | null
          coupon_sequence_counter: number | null
          created_at: string | null
          description: string | null
          distribution_window_days: number | null
          first_batch_target: number | null
          id: string
          is_active: boolean | null
          issuance_end_date: string | null
          issuance_start_date: string | null
          issuance_window_days: number | null
          issuance_window_type: string | null
          loyalty_brand: string | null
          loyalty_campaign_code: string | null
          loyalty_code: string | null
          m_redemption_end_date: string | null
          m_redemption_start_date: string | null
          m_redemption_window_type: string | null
          offer_identifier: string | null
          offer_variables: string | null
          publish_end_date: string | null
          publish_start_date: string | null
          referral_brand: string | null
          referral_campaign_code: string | null
          referral_code: string | null
          start_date: string | null
          title: string
          updated_at: string | null
          valid_days: number | null
          vehicle_config: string | null
          visited_count: number | null
        }
        Insert: {
          activated_at?: string | null
          b_redemption_end_date?: string | null
          b_redemption_start_date?: string | null
          b_redemption_window_type?: string | null
          b_valid_days?: number | null
          commission_amount?: number | null
          coupon_cap?: number | null
          coupon_code_structure?: string | null
          coupon_sequence_counter?: number | null
          created_at?: string | null
          description?: string | null
          distribution_window_days?: number | null
          first_batch_target?: number | null
          id?: string
          is_active?: boolean | null
          issuance_end_date?: string | null
          issuance_start_date?: string | null
          issuance_window_days?: number | null
          issuance_window_type?: string | null
          loyalty_brand?: string | null
          loyalty_campaign_code?: string | null
          loyalty_code?: string | null
          m_redemption_end_date?: string | null
          m_redemption_start_date?: string | null
          m_redemption_window_type?: string | null
          offer_identifier?: string | null
          offer_variables?: string | null
          publish_end_date?: string | null
          publish_start_date?: string | null
          referral_brand?: string | null
          referral_campaign_code?: string | null
          referral_code?: string | null
          start_date?: string | null
          title: string
          updated_at?: string | null
          valid_days?: number | null
          vehicle_config?: string | null
          visited_count?: number | null
        }
        Update: {
          activated_at?: string | null
          b_redemption_end_date?: string | null
          b_redemption_start_date?: string | null
          b_redemption_window_type?: string | null
          b_valid_days?: number | null
          commission_amount?: number | null
          coupon_cap?: number | null
          coupon_code_structure?: string | null
          coupon_sequence_counter?: number | null
          created_at?: string | null
          description?: string | null
          distribution_window_days?: number | null
          first_batch_target?: number | null
          id?: string
          is_active?: boolean | null
          issuance_end_date?: string | null
          issuance_start_date?: string | null
          issuance_window_days?: number | null
          issuance_window_type?: string | null
          loyalty_brand?: string | null
          loyalty_campaign_code?: string | null
          loyalty_code?: string | null
          m_redemption_end_date?: string | null
          m_redemption_start_date?: string | null
          m_redemption_window_type?: string | null
          offer_identifier?: string | null
          offer_variables?: string | null
          publish_end_date?: string | null
          publish_start_date?: string | null
          referral_brand?: string | null
          referral_campaign_code?: string | null
          referral_code?: string | null
          start_date?: string | null
          title?: string
          updated_at?: string | null
          valid_days?: number | null
          vehicle_config?: string | null
          visited_count?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          advisor_code: string | null
          allowed_pages: string[] | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          user_role: string
        }
        Insert: {
          advisor_code?: string | null
          allowed_pages?: string[] | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean | null
          updated_at?: string | null
          user_role?: string
        }
        Update: {
          advisor_code?: string | null
          allowed_pages?: string[] | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          user_role?: string
        }
        Relationships: []
      }
      referral_customers: {
        Row: {
          car_make: string | null
          car_model: string | null
          created_at: string | null
          customer_id: string
          email: string | null
          full_name: string | null
          id: string
          mobile_number: string
          plate_numbers: string[]
          updated_at: string | null
        }
        Insert: {
          car_make?: string | null
          car_model?: string | null
          created_at?: string | null
          customer_id: string
          email?: string | null
          full_name?: string | null
          id?: string
          mobile_number: string
          plate_numbers?: string[]
          updated_at?: string | null
        }
        Update: {
          car_make?: string | null
          car_model?: string | null
          created_at?: string | null
          customer_id?: string
          email?: string | null
          full_name?: string | null
          id?: string
          mobile_number?: string
          plate_numbers?: string[]
          updated_at?: string | null
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          action: string
          id: string
          is_allowed: boolean | null
          resource: string
          role: string
          updated_at: string | null
        }
        Insert: {
          action: string
          id?: string
          is_allowed?: boolean | null
          resource: string
          role: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          id?: string
          is_allowed?: boolean | null
          resource?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sub_offers: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          offer_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          offer_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          offer_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sub_offers_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      template_variable_positions: {
        Row: {
          created_at: string | null
          font_color: string | null
          font_size: number | null
          font_weight: string | null
          id: string
          template_id: string
          variable_key: string
          x_coordinate: number | null
          y_coordinate: number | null
        }
        Insert: {
          created_at?: string | null
          font_color?: string | null
          font_size?: number | null
          font_weight?: string | null
          id?: string
          template_id: string
          variable_key: string
          x_coordinate?: number | null
          y_coordinate?: number | null
        }
        Update: {
          created_at?: string | null
          font_color?: string | null
          font_size?: number | null
          font_weight?: string | null
          id?: string
          template_id?: string
          variable_key?: string
          x_coordinate?: number | null
          y_coordinate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "template_variable_positions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          coupon_code_prefix: string | null
          coupon_type: string | null
          created_at: string | null
          file_url: string
          font_family: string | null
          id: string
          image_height: number | null
          image_width: number | null
          is_active: boolean | null
          is_default: boolean | null
          name: string
          offer_id: string | null
          storage_path: string | null
          text_color: string | null
          updated_at: string | null
        }
        Insert: {
          coupon_code_prefix?: string | null
          coupon_type?: string | null
          created_at?: string | null
          file_url: string
          font_family?: string | null
          id?: string
          image_height?: number | null
          image_width?: number | null
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          offer_id?: string | null
          storage_path?: string | null
          text_color?: string | null
          updated_at?: string | null
        }
        Update: {
          coupon_code_prefix?: string | null
          coupon_type?: string | null
          created_at?: string | null
          file_url?: string
          font_family?: string | null
          id?: string
          image_height?: number | null
          image_width?: number | null
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          offer_id?: string | null
          storage_path?: string | null
          text_color?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "templates_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_m_coupon_stage: { Args: { p_b_coupon_id: string }; Returns: Json }
      get_advisor_leaderboard: {
        Args: never
        Returns: {
          advisor_code: string
          advisor_name: string
          coupons_this_month: number
          invoices_this_month: number
          score: number
        }[]
      }
      get_dashboard_stats: {
        Args: never
        Returns: {
          redeemed_coupons: number
          referral_visits: number
          today_coupons: number
          total_advisors: number
          total_coupon_rows: number
          total_coupons: number
        }[]
      }
      get_offer_stage_counts: {
        Args: never
        Returns: {
          count: number
          offer_id: string
          stage_number: number
        }[]
      }
      get_offer_summaries: {
        Args: never
        Returns: {
          actual_visited: number
          loyalty_issued: number
          offer_id: string
          referral_issued: number
          total_issued: number
        }[]
      }
      increment_coupon_sequence: {
        Args: { p_offer_id: string }
        Returns: number
      }
      increment_offer_visited_count: {
        Args: { offer_id_input: string }
        Returns: undefined
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
