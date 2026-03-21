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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_campaigns: {
        Row: {
          advertiser_id: string
          bid_amount_cpm: number
          body_text: string | null
          business_id: string | null
          clicks: number
          created_at: string
          cta_text: string | null
          cta_url: string | null
          ctr: number
          daily_budget: number
          effective_cpm: number
          ends_at: string | null
          headline: string
          id: string
          impressions: number
          media_url: string | null
          name: string
          placement: Database["public"]["Enums"]["ad_placement"]
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          spent: number
          starts_at: string | null
          status: Database["public"]["Enums"]["ad_status"]
          target_age_max: number | null
          target_age_min: number | null
          target_interests: string[] | null
          target_locations: string[] | null
          total_budget: number | null
          updated_at: string
        }
        Insert: {
          advertiser_id: string
          bid_amount_cpm?: number
          body_text?: string | null
          business_id?: string | null
          clicks?: number
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          ctr?: number
          daily_budget?: number
          effective_cpm?: number
          ends_at?: string | null
          headline: string
          id?: string
          impressions?: number
          media_url?: string | null
          name: string
          placement?: Database["public"]["Enums"]["ad_placement"]
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["ad_status"]
          target_age_max?: number | null
          target_age_min?: number | null
          target_interests?: string[] | null
          target_locations?: string[] | null
          total_budget?: number | null
          updated_at?: string
        }
        Update: {
          advertiser_id?: string
          bid_amount_cpm?: number
          body_text?: string | null
          business_id?: string | null
          clicks?: number
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          ctr?: number
          daily_budget?: number
          effective_cpm?: number
          ends_at?: string | null
          headline?: string
          id?: string
          impressions?: number
          media_url?: string | null
          name?: string
          placement?: Database["public"]["Enums"]["ad_placement"]
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spent?: number
          starts_at?: string | null
          status?: Database["public"]["Enums"]["ad_status"]
          target_age_max?: number | null
          target_age_min?: number | null
          target_interests?: string[] | null
          target_locations?: string[] | null
          total_budget?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ad_campaigns_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_advertiser_id_fkey"
            columns: ["advertiser_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ad_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ad_campaigns_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaigns_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      ad_credits: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          expires_at: string | null
          id: string
          remaining: number
          source: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          remaining: number
          source?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          remaining?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_credits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_credits_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_daily_stats: {
        Row: {
          campaign_id: string
          clicks: number
          cpm: number
          created_at: string
          ctr: number
          id: string
          impressions: number
          spent: number
          stat_date: string
        }
        Insert: {
          campaign_id: string
          clicks?: number
          cpm?: number
          created_at?: string
          ctr?: number
          id?: string
          impressions?: number
          spent?: number
          stat_date?: string
        }
        Update: {
          campaign_id?: string
          clicks?: number
          cpm?: number
          created_at?: string
          ctr?: number
          id?: string
          impressions?: number
          spent?: number
          stat_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_daily_stats_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_impressions: {
        Row: {
          campaign_id: string
          clicked: boolean
          clicked_at: string | null
          id: string
          ip_hash: string | null
          placement: Database["public"]["Enums"]["ad_placement"]
          viewed_at: string
          viewer_id: string | null
        }
        Insert: {
          campaign_id: string
          clicked?: boolean
          clicked_at?: string | null
          id?: string
          ip_hash?: string | null
          placement: Database["public"]["Enums"]["ad_placement"]
          viewed_at?: string
          viewer_id?: string | null
        }
        Update: {
          campaign_id?: string
          clicked?: boolean
          clicked_at?: string | null
          id?: string
          ip_hash?: string | null
          placement?: Database["public"]["Enums"]["ad_placement"]
          viewed_at?: string
          viewer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_impressions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_impressions_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ad_impressions_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_impressions_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_impressions_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      ai_brief_preferences: {
        Row: {
          brief_style: string | null
          created_at: string
          custom_topics: string[] | null
          excluded_topics: string[] | null
          id: string
          preferred_sources: string[] | null
          show_images: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brief_style?: string | null
          created_at?: string
          custom_topics?: string[] | null
          excluded_topics?: string[] | null
          id?: string
          preferred_sources?: string[] | null
          show_images?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brief_style?: string | null
          created_at?: string
          custom_topics?: string[] | null
          excluded_topics?: string[] | null
          id?: string
          preferred_sources?: string[] | null
          show_images?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_brief_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "ai_brief_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_brief_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_brief_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          created_at: string
          event_data: Json | null
          event_name: string
          id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_name: string
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_name?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      announcements: {
        Row: {
          author_id: string
          content: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          title: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          title: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      app_secrets: {
        Row: {
          created_at: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          can_be_disabled: boolean | null
          category: Database["public"]["Enums"]["badge_category"]
          created_at: string | null
          description: string | null
          effect: string | null
          gradient_from: string | null
          gradient_to: string | null
          gradient_via: string | null
          icon: string
          id: string
          is_active: boolean | null
          is_animated: boolean | null
          is_staff_badge: boolean | null
          name: string
          priority: number
          unlock_requirement: string | null
          unlock_threshold: number | null
          updated_at: string | null
        }
        Insert: {
          can_be_disabled?: boolean | null
          category: Database["public"]["Enums"]["badge_category"]
          created_at?: string | null
          description?: string | null
          effect?: string | null
          gradient_from?: string | null
          gradient_to?: string | null
          gradient_via?: string | null
          icon: string
          id?: string
          is_active?: boolean | null
          is_animated?: boolean | null
          is_staff_badge?: boolean | null
          name: string
          priority?: number
          unlock_requirement?: string | null
          unlock_threshold?: number | null
          updated_at?: string | null
        }
        Update: {
          can_be_disabled?: boolean | null
          category?: Database["public"]["Enums"]["badge_category"]
          created_at?: string | null
          description?: string | null
          effect?: string | null
          gradient_from?: string | null
          gradient_to?: string | null
          gradient_via?: string | null
          icon?: string
          id?: string
          is_active?: boolean | null
          is_animated?: boolean | null
          is_staff_badge?: boolean | null
          name?: string
          priority?: number
          unlock_requirement?: string | null
          unlock_threshold?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      battle_pass_tiers: {
        Row: {
          created_at: string
          id: string
          is_premium: boolean
          level: number
          reward_description: string | null
          reward_icon: string
          reward_id: string | null
          reward_name: string
          reward_type: string
          xp_required: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_premium?: boolean
          level: number
          reward_description?: string | null
          reward_icon?: string
          reward_id?: string | null
          reward_name: string
          reward_type: string
          xp_required: number
        }
        Update: {
          created_at?: string
          id?: string
          is_premium?: boolean
          level?: number
          reward_description?: string | null
          reward_icon?: string
          reward_id?: string | null
          reward_name?: string
          reward_type?: string
          xp_required?: number
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      bug_reports: {
        Row: {
          admin_notes: string | null
          ai_analysis: string | null
          ai_severity: string | null
          component_stack: string | null
          created_at: string
          error_message: string
          error_stack: string | null
          id: string
          page_url: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
          user_agent: string | null
          xp_awarded: boolean
        }
        Insert: {
          admin_notes?: string | null
          ai_analysis?: string | null
          ai_severity?: string | null
          component_stack?: string | null
          created_at?: string
          error_message: string
          error_stack?: string | null
          id?: string
          page_url?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          xp_awarded?: boolean
        }
        Update: {
          admin_notes?: string | null
          ai_analysis?: string | null
          ai_severity?: string | null
          component_stack?: string | null
          created_at?: string
          error_message?: string
          error_stack?: string | null
          id?: string
          page_url?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          xp_awarded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "bug_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bug_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bug_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "bug_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bug_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      business_offers: {
        Row: {
          accepted_at: string | null
          business_id: string
          completed_at: string | null
          conversation_id: string
          created_at: string
          declined_at: string | null
          delivery_days: number
          description: string | null
          expires_at: string | null
          id: string
          message_id: string | null
          price: number
          recipient_id: string
          revisions: number | null
          sender_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          business_id: string
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          declined_at?: string | null
          delivery_days?: number
          description?: string | null
          expires_at?: string | null
          id?: string
          message_id?: string | null
          price: number
          recipient_id: string
          revisions?: number | null
          sender_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          business_id?: string
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          declined_at?: string | null
          delivery_days?: number
          description?: string | null
          expires_at?: string | null
          id?: string
          message_id?: string | null
          price?: number
          recipient_id?: string
          revisions?: number | null
          sender_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_offers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_offers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_offers_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_offers_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_offers_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_offers_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_offers_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_offers_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_offers_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_offers_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_offers_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_offers_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      business_orders: {
        Row: {
          business_id: string
          created_at: string
          customer_id: string
          id: string
          items: Json
          notes: string | null
          order_number: string
          payment_status: string
          shipping: number | null
          shipping_address: Json | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          tax: number | null
          total: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          customer_id: string
          id?: string
          items?: Json
          notes?: string | null
          order_number: string
          payment_status?: string
          shipping?: number | null
          shipping_address?: Json | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal: number
          tax?: number | null
          total: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          items?: Json
          notes?: string | null
          order_number?: string
          payment_status?: string
          shipping?: number | null
          shipping_address?: Json | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax?: number | null
          total?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      business_products: {
        Row: {
          business_id: string
          category: string | null
          compare_at_price: number | null
          created_at: string
          description: string | null
          digital_file_url: string | null
          id: string
          images: string[] | null
          inventory_count: number | null
          is_active: boolean | null
          is_digital: boolean | null
          is_featured: boolean | null
          price: number
          sku: string | null
          sold_count: number | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          business_id: string
          category?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          digital_file_url?: string | null
          id?: string
          images?: string[] | null
          inventory_count?: number | null
          is_active?: boolean | null
          is_digital?: boolean | null
          is_featured?: boolean | null
          price: number
          sku?: string | null
          sold_count?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          business_id?: string
          category?: string | null
          compare_at_price?: number | null
          created_at?: string
          description?: string | null
          digital_file_url?: string | null
          id?: string
          images?: string[] | null
          inventory_count?: number | null
          is_active?: boolean | null
          is_digital?: boolean | null
          is_featured?: boolean | null
          price?: number
          sku?: string | null
          sold_count?: number | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "business_products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          banner_url: string | null
          business_hours: Json | null
          category: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          location: string | null
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          rating_average: number | null
          rating_count: number | null
          slug: string
          social_links: Json | null
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean | null
          total_revenue: number | null
          total_sales: number | null
          updated_at: string
          view_count: number | null
          website: string | null
        }
        Insert: {
          banner_url?: string | null
          business_hours?: Json | null
          category?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          rating_average?: number | null
          rating_count?: number | null
          slug: string
          social_links?: Json | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          total_revenue?: number | null
          total_sales?: number | null
          updated_at?: string
          view_count?: number | null
          website?: string | null
        }
        Update: {
          banner_url?: string | null
          business_hours?: Json | null
          category?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          rating_average?: number | null
          rating_count?: number | null
          slug?: string
          social_links?: Json | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          total_revenue?: number | null
          total_sales?: number | null
          updated_at?: string
          view_count?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      business_reviews: {
        Row: {
          business_id: string
          content: string | null
          created_at: string
          helpful_count: number | null
          id: string
          images: string[] | null
          is_verified_purchase: boolean | null
          order_id: string | null
          rating: number
          reviewer_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          content?: string | null
          created_at?: string
          helpful_count?: number | null
          id?: string
          images?: string[] | null
          is_verified_purchase?: boolean | null
          order_id?: string | null
          rating: number
          reviewer_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          content?: string | null
          created_at?: string
          helpful_count?: number | null
          id?: string
          images?: string[] | null
          is_verified_purchase?: boolean | null
          order_id?: string | null
          rating?: number
          reviewer_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_reviews_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "business_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      business_subscription_tiers: {
        Row: {
          analytics_level: string
          created_at: string
          description: string | null
          features: Json
          id: string
          is_active: boolean
          max_ad_credits_monthly: number | null
          max_products: number | null
          name: string
          price_monthly: number
          priority_support: boolean
          promo_tools_enabled: boolean
          rc_product_id: string | null
          slug: string
          sort_order: number
          updated_at: string
          visibility_boost_multiplier: number
        }
        Insert: {
          analytics_level?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_ad_credits_monthly?: number | null
          max_products?: number | null
          name: string
          price_monthly?: number
          priority_support?: boolean
          promo_tools_enabled?: boolean
          rc_product_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
          visibility_boost_multiplier?: number
        }
        Update: {
          analytics_level?: string
          created_at?: string
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean
          max_ad_credits_monthly?: number | null
          max_products?: number | null
          name?: string
          price_monthly?: number
          priority_support?: boolean
          promo_tools_enabled?: boolean
          rc_product_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
          visibility_boost_multiplier?: number
        }
        Relationships: []
      }
      business_subscriptions: {
        Row: {
          business_id: string
          cancelled_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          rc_subscription_id: string | null
          started_at: string
          status: string
          tier_id: string
          updated_at: string
        }
        Insert: {
          business_id: string
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          rc_subscription_id?: string | null
          started_at?: string
          status?: string
          tier_id: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          rc_subscription_id?: string | null
          started_at?: string
          status?: string
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "business_profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "business_subscription_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      call_signals: {
        Row: {
          call_id: string
          created_at: string
          from_user_id: string
          id: string
          signal_data: Json
          signal_type: string
          to_user_id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          from_user_id: string
          id?: string
          signal_data: Json
          signal_type: string
          to_user_id: string
        }
        Update: {
          call_id?: string
          created_at?: string
          from_user_id?: string
          id?: string
          signal_data?: Json
          signal_type?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_signals_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "call_signals_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "call_signals_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "call_signals_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_signals_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      calls: {
        Row: {
          call_type: string
          caller_id: string
          conversation_id: string
          created_at: string
          ended_at: string | null
          id: string
          is_group_call: boolean | null
          max_participants: number | null
          receiver_id: string
          room_name: string | null
          room_url: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          call_type: string
          caller_id: string
          conversation_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          is_group_call?: boolean | null
          max_participants?: number | null
          receiver_id: string
          room_name?: string | null
          room_url?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          call_type?: string
          caller_id?: string
          conversation_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          is_group_call?: boolean | null
          max_participants?: number | null
          receiver_id?: string
          room_name?: string | null
          room_url?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "calls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "calls_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      capture_events: {
        Row: {
          client_timestamp: string | null
          conversation_id: string | null
          created_at: string
          id: string
          media_id: string | null
          sender_id: string
          signals: string[] | null
          type: string
          viewer_id: string
        }
        Insert: {
          client_timestamp?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          media_id?: string | null
          sender_id: string
          signals?: string[] | null
          type: string
          viewer_id: string
        }
        Update: {
          client_timestamp?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          media_id?: string | null
          sender_id?: string
          signals?: string[] | null
          type?: string
          viewer_id?: string
        }
        Relationships: []
      }
      challenge_progress: {
        Row: {
          challenge_id: string
          completed_at: string | null
          created_at: string | null
          current_count: number | null
          id: string
          is_completed: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          created_at?: string | null
          current_count?: number | null
          id?: string
          is_completed?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          created_at?: string | null
          current_count?: number | null
          id?: string
          is_completed?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "challenge_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      challenge_rewards: {
        Row: {
          badge_id: string | null
          challenge_id: string
          claimed_at: string | null
          created_at: string
          id: string
          is_claimed: boolean
          user_id: string
          xp_amount: number
        }
        Insert: {
          badge_id?: string | null
          challenge_id: string
          claimed_at?: string | null
          created_at?: string
          id?: string
          is_claimed?: boolean
          user_id: string
          xp_amount: number
        }
        Update: {
          badge_id?: string | null
          challenge_id?: string
          claimed_at?: string | null
          created_at?: string
          id?: string
          is_claimed?: boolean
          user_id?: string
          xp_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_rewards_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_rewards_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_templates: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          requirement_count: number
          requirement_type: string
          reward_badge_id: string | null
          reward_xp: number | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          requirement_count?: number
          requirement_type: string
          reward_badge_id?: string | null
          reward_xp?: number | null
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          requirement_count?: number
          requirement_type?: string
          reward_badge_id?: string | null
          reward_xp?: number | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_templates_reward_badge_id_fkey"
            columns: ["reward_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          active_date: string | null
          active_week_start: string | null
          created_at: string | null
          description: string | null
          ends_at: string | null
          id: string
          is_active: boolean | null
          requirement_count: number | null
          requirement_type: string
          reward_badge_id: string | null
          reward_xp: number | null
          starts_at: string | null
          template_id: string | null
          title: string
          type: string
        }
        Insert: {
          active_date?: string | null
          active_week_start?: string | null
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          requirement_count?: number | null
          requirement_type: string
          reward_badge_id?: string | null
          reward_xp?: number | null
          starts_at?: string | null
          template_id?: string | null
          title: string
          type: string
        }
        Update: {
          active_date?: string | null
          active_week_start?: string | null
          created_at?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          requirement_count?: number | null
          requirement_type?: string
          reward_badge_id?: string | null
          reward_xp?: number | null
          starts_at?: string | null
          template_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_reward_badge_id_fkey"
            columns: ["reward_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "challenge_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_messages: {
        Row: {
          channel_id: string
          content: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          is_pinned: boolean | null
          media_type: string | null
          media_url: string | null
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          channel_id: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          is_pinned?: boolean | null
          media_type?: string | null
          media_url?: string | null
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          channel_id?: string
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          is_pinned?: boolean | null
          media_type?: string | null
          media_url?: string | null
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "channel_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "channel_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      channel_permissions: {
        Row: {
          can_attach_media: boolean
          can_manage: boolean
          can_pin: boolean
          can_send: boolean
          can_view: boolean
          channel_id: string
          created_at: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          can_attach_media?: boolean
          can_manage?: boolean
          can_pin?: boolean
          can_send?: boolean
          can_view?: boolean
          channel_id: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Update: {
          can_attach_media?: boolean
          can_manage?: boolean
          can_pin?: boolean
          can_send?: boolean
          can_view?: boolean
          channel_id?: string
          created_at?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_permissions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_permissions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_private: boolean | null
          name: string
          position: number | null
          room_type: string | null
          server_id: string
          type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_private?: boolean | null
          name: string
          position?: number | null
          room_type?: string | null
          server_id: string
          type?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_private?: boolean | null
          name?: string
          position?: number | null
          room_type?: string | null
          server_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "public_servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_presence: {
        Row: {
          conversation_id: string
          id: string
          last_seen_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          last_seen_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          last_seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_presence_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "chat_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      checkin_prompts: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          pillar: string | null
          prompt_text: string
          week_number: number | null
          year: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          pillar?: string | null
          prompt_text: string
          week_number?: number | null
          year?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          pillar?: string | null
          prompt_text?: string
          week_number?: number | null
          year?: number | null
        }
        Relationships: []
      }
      close_friends: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "close_friends_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "close_friends_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_friends_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_friends_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "close_friends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "close_friends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_friends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_friends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      collab_post_invites: {
        Row: {
          created_at: string
          id: string
          invitee_id: string
          inviter_id: string
          post_id: string | null
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          post_id?: string | null
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          post_id?: string | null
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "collab_post_invites_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      collab_posts: {
        Row: {
          accepted_at: string | null
          collaborator_id: string
          created_at: string
          id: string
          post_id: string
          role: string | null
        }
        Insert: {
          accepted_at?: string | null
          collaborator_id: string
          created_at?: string
          id?: string
          post_id: string
          role?: string | null
        }
        Update: {
          accepted_at?: string | null
          collaborator_id?: string
          created_at?: string
          id?: string
          post_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collab_posts_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "collab_posts_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_posts_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collab_posts_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "collab_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_flagged: boolean | null
          post_id: string
          safety_categories: string[] | null
          safety_score: number | null
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_flagged?: boolean | null
          post_id: string
          safety_categories?: string[] | null
          safety_score?: number | null
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_flagged?: boolean | null
          post_id?: string
          safety_categories?: string[] | null
          safety_score?: number | null
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      community_guidelines: {
        Row: {
          content: string
          id: string
          is_current: boolean | null
          published_at: string
          version: string
        }
        Insert: {
          content: string
          id?: string
          is_current?: boolean | null
          published_at?: string
          version: string
        }
        Update: {
          content?: string
          id?: string
          is_current?: boolean | null
          published_at?: string
          version?: string
        }
        Relationships: []
      }
      content_appeals: {
        Row: {
          admin_notes: string | null
          content_type: string
          created_at: string
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          content_type: string
          created_at?: string
          id?: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          content_type?: string
          created_at?: string
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_appeals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "content_appeals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_appeals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_appeals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "content_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "content_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      content_flags: {
        Row: {
          ai_categories: Json | null
          ai_score: number | null
          content_id: string
          content_type: string
          created_at: string
          flagged_text: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          ai_categories?: Json | null
          ai_score?: number | null
          content_id: string
          content_type: string
          created_at?: string
          flagged_text?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          ai_categories?: Json | null
          ai_score?: number | null
          content_id?: string
          content_type?: string
          created_at?: string
          flagged_text?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_flags_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "content_flags_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_flags_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_flags_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          id: string
          is_muted: boolean | null
          is_pinned: boolean | null
          joined_at: string
          last_read_at: string | null
          nickname: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_muted?: boolean | null
          is_pinned?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          nickname?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_muted?: boolean | null
          is_pinned?: boolean | null
          joined_at?: string
          last_read_at?: string | null
          nickname?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_group: boolean | null
          max_members: number | null
          name: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_group?: boolean | null
          max_members?: number | null
          name?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_group?: boolean | null
          max_members?: number | null
          name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      creator_daily_stats: {
        Row: {
          ad_impressions: number
          ad_revenue: number
          cpm: number | null
          created_at: string
          creator_id: string
          id: string
          new_subscribers: number
          rpm: number | null
          stat_date: string
          subscription_revenue: number
          tip_revenue: number
          views: number
        }
        Insert: {
          ad_impressions?: number
          ad_revenue?: number
          cpm?: number | null
          created_at?: string
          creator_id: string
          id?: string
          new_subscribers?: number
          rpm?: number | null
          stat_date: string
          subscription_revenue?: number
          tip_revenue?: number
          views?: number
        }
        Update: {
          ad_impressions?: number
          ad_revenue?: number
          cpm?: number | null
          created_at?: string
          creator_id?: string
          id?: string
          new_subscribers?: number
          rpm?: number | null
          stat_date?: string
          subscription_revenue?: number
          tip_revenue?: number
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "creator_daily_stats_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_earnings: {
        Row: {
          created_at: string
          creator_amount: number
          creator_id: string
          currency: string
          gross_amount: number
          id: string
          metadata: Json | null
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          platform_fee: number
          platform_fee_pct: number
          source: string
          status: string
          stripe_transfer_id: string | null
        }
        Insert: {
          created_at?: string
          creator_amount: number
          creator_id: string
          currency?: string
          gross_amount: number
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          platform_fee: number
          platform_fee_pct: number
          source: string
          status?: string
          stripe_transfer_id?: string | null
        }
        Update: {
          created_at?: string
          creator_amount?: number
          creator_id?: string
          currency?: string
          gross_amount?: number
          id?: string
          metadata?: Json | null
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          platform_fee?: number
          platform_fee_pct?: number
          source?: string
          status?: string
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_earnings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_payouts: {
        Row: {
          amount: number
          creator_id: string
          currency: string
          failed_reason: string | null
          id: string
          processed_at: string | null
          requested_at: string
          status: string
          stripe_payout_id: string | null
        }
        Insert: {
          amount: number
          creator_id: string
          currency?: string
          failed_reason?: string | null
          id?: string
          processed_at?: string | null
          requested_at?: string
          status?: string
          stripe_payout_id?: string | null
        }
        Update: {
          amount?: number
          creator_id?: string
          currency?: string
          failed_reason?: string | null
          id?: string
          processed_at?: string | null
          requested_at?: string
          status?: string
          stripe_payout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_payouts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          applied_at: string | null
          approved_at: string | null
          created_at: string
          id: string
          is_approved: boolean
          lifetime_ad_impressions: number
          lifetime_views: number
          pending_payout: number
          stripe_connect_account_id: string | null
          stripe_onboarding_complete: boolean | null
          subscriber_count: number
          tax_form_submitted: boolean | null
          tier: Database["public"]["Enums"]["creator_tier"]
          tier_upgraded_at: string | null
          total_earnings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          approved_at?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          lifetime_ad_impressions?: number
          lifetime_views?: number
          pending_payout?: number
          stripe_connect_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          subscriber_count?: number
          tax_form_submitted?: boolean | null
          tier?: Database["public"]["Enums"]["creator_tier"]
          tier_upgraded_at?: string | null
          total_earnings?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          approved_at?: string | null
          created_at?: string
          id?: string
          is_approved?: boolean
          lifetime_ad_impressions?: number
          lifetime_views?: number
          pending_payout?: number
          stripe_connect_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          subscriber_count?: number
          tax_form_submitted?: boolean | null
          tier?: Database["public"]["Enums"]["creator_tier"]
          tier_upgraded_at?: string | null
          total_earnings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dismissed_announcements: {
        Row: {
          announcement_id: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dismissed_announcements_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dismissed_announcements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "dismissed_announcements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dismissed_announcements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dismissed_announcements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      dismissed_profiles: {
        Row: {
          created_at: string
          dismissed_user_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dismissed_user_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dismissed_user_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dismissed_profiles_dismissed_user_id_fkey"
            columns: ["dismissed_user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "dismissed_profiles_dismissed_user_id_fkey"
            columns: ["dismissed_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dismissed_profiles_dismissed_user_id_fkey"
            columns: ["dismissed_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dismissed_profiles_dismissed_user_id_fkey"
            columns: ["dismissed_user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "dismissed_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "dismissed_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dismissed_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dismissed_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      dm_settings: {
        Row: {
          chat_font: string | null
          chat_sound: string | null
          chat_wallpaper: string | null
          conversation_id: string
          created_at: string
          emotional_pulse: string | null
          id: string
          read_receipt_mode: string
          show_emotional_pulse: boolean | null
          theme: string | null
          typing_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chat_font?: string | null
          chat_sound?: string | null
          chat_wallpaper?: string | null
          conversation_id: string
          created_at?: string
          emotional_pulse?: string | null
          id?: string
          read_receipt_mode?: string
          show_emotional_pulse?: boolean | null
          theme?: string | null
          typing_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chat_font?: string | null
          chat_sound?: string | null
          chat_wallpaper?: string | null
          conversation_id?: string
          created_at?: string
          emotional_pulse?: string | null
          id?: string
          read_receipt_mode?: string
          show_emotional_pulse?: boolean | null
          theme?: string | null
          typing_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_settings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "dm_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      dna_content_preferences: {
        Row: {
          boost_topics: string[] | null
          conversation_context: Json | null
          created_at: string
          creator_affinity_overrides: Json | null
          discovery_level: string | null
          id: string
          preferred_content_types: string[] | null
          reduce_topics: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          boost_topics?: string[] | null
          conversation_context?: Json | null
          created_at?: string
          creator_affinity_overrides?: Json | null
          discovery_level?: string | null
          id?: string
          preferred_content_types?: string[] | null
          reduce_topics?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          boost_topics?: string[] | null
          conversation_context?: Json | null
          created_at?: string
          creator_affinity_overrides?: Json | null
          discovery_level?: string | null
          id?: string
          preferred_content_types?: string[] | null
          reduce_topics?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dna_content_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "dna_content_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dna_content_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dna_content_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          created_at: string
          error_message: string
          error_stack: string | null
          error_type: string
          id: string
          page_url: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message: string
          error_stack?: string | null
          error_type?: string
          id?: string
          page_url?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string
          error_stack?: string | null
          error_type?: string
          id?: string
          page_url?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      event_comments: {
        Row: {
          content: string
          created_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "event_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      event_reminders: {
        Row: {
          created_at: string
          event_id: string
          id: string
          remind_at: string
          reminded: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          remind_at: string
          reminded?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          remind_at?: string
          reminded?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      events: {
        Row: {
          category: string | null
          cover_image: string | null
          created_at: string
          description: string | null
          end_time: string | null
          event_type: string
          host_id: string
          id: string
          is_featured: boolean | null
          is_public: boolean | null
          live_url: string | null
          location: string | null
          max_attendees: number | null
          online_link: string | null
          replay_url: string | null
          sponsor_id: string | null
          start_time: string
          title: string
          updated_at: string
          visibility: string | null
        }
        Insert: {
          category?: string | null
          cover_image?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_type?: string
          host_id: string
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          live_url?: string | null
          location?: string | null
          max_attendees?: number | null
          online_link?: string | null
          replay_url?: string | null
          sponsor_id?: string | null
          start_time: string
          title: string
          updated_at?: string
          visibility?: string | null
        }
        Update: {
          category?: string | null
          cover_image?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_type?: string
          host_id?: string
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          live_url?: string | null
          location?: string | null
          max_attendees?: number | null
          online_link?: string | null
          replay_url?: string | null
          sponsor_id?: string | null
          start_time?: string
          title?: string
          updated_at?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "events_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "public_sponsor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsor_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          shipped_at: string | null
          status: string
          title: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          shipped_at?: string | null
          status?: string
          title: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          shipped_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "feature_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      feature_votes: {
        Row: {
          created_at: string
          feature_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feature_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feature_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_votes_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "feature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          likes_count: number
          message: string
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          likes_count?: number
          message: string
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          likes_count?: number
          message?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      feedback_likes: {
        Row: {
          created_at: string
          feedback_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_likes_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "feedback_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      filter_saves: {
        Row: {
          created_at: string
          filter_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filter_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filter_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "filter_saves_filter_id_fkey"
            columns: ["filter_id"]
            isOneToOne: false
            referencedRelation: "filters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filter_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "filter_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filter_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filter_saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      filter_usage: {
        Row: {
          created_at: string
          filter_id: string
          id: string
          post_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          filter_id: string
          id?: string
          post_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          filter_id?: string
          id?: string
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "filter_usage_filter_id_fkey"
            columns: ["filter_id"]
            isOneToOne: false
            referencedRelation: "filters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filter_usage_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filter_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "filter_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filter_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filter_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      filters: {
        Row: {
          category: string
          created_at: string
          creator_id: string
          css_filter: string
          description: string | null
          effect_config: Json | null
          id: string
          is_approved: boolean
          is_published: boolean
          name: string
          overlay_url: string | null
          rejection_reason: string | null
          save_count: number
          trending_score: number
          updated_at: string
          usage_count: number
        }
        Insert: {
          category?: string
          created_at?: string
          creator_id: string
          css_filter?: string
          description?: string | null
          effect_config?: Json | null
          id?: string
          is_approved?: boolean
          is_published?: boolean
          name: string
          overlay_url?: string | null
          rejection_reason?: string | null
          save_count?: number
          trending_score?: number
          updated_at?: string
          usage_count?: number
        }
        Update: {
          category?: string
          created_at?: string
          creator_id?: string
          css_filter?: string
          description?: string | null
          effect_config?: Json | null
          id?: string
          is_approved?: boolean
          is_published?: boolean
          name?: string
          overlay_url?: string | null
          rejection_reason?: string | null
          save_count?: number
          trending_score?: number
          updated_at?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "filters_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "filters_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filters_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filters_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      friend_drops: {
        Row: {
          completed_at: string | null
          confirmed_at: string | null
          created_at: string
          from_user_id: string
          id: string
          status: string
          to_user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          from_user_id: string
          id?: string
          status?: string
          to_user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          from_user_id?: string
          id?: string
          status?: string
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "friend_drops_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "friend_drops_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_drops_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_drops_from_user_id_fkey"
            columns: ["from_user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "friend_drops_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "friend_drops_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_drops_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_drops_to_user_id_fkey"
            columns: ["to_user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string
          id: string
          notified_at: string | null
          receiver_id: string
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notified_at?: string | null
          receiver_id: string
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notified_at?: string | null
          receiver_id?: string
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      gifted_premium: {
        Row: {
          accepted_at: string | null
          created_at: string
          gifted_by: string
          id: string
          is_active: boolean
          revoked_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          gifted_by: string
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          gifted_by?: string
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      group_call_participants: {
        Row: {
          call_id: string
          id: string
          is_muted: boolean | null
          is_video_enabled: boolean | null
          joined_at: string
          left_at: string | null
          user_id: string
        }
        Insert: {
          call_id: string
          id?: string
          is_muted?: boolean | null
          is_video_enabled?: boolean | null
          joined_at?: string
          left_at?: string | null
          user_id: string
        }
        Update: {
          call_id?: string
          id?: string
          is_muted?: boolean | null
          is_video_enabled?: boolean | null
          joined_at?: string
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "group_call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_call_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      group_members: {
        Row: {
          conversation_id: string
          id: string
          invited_by: string | null
          is_muted: boolean | null
          joined_at: string
          nickname: string | null
          role: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          invited_by?: string | null
          is_muted?: boolean | null
          joined_at?: string
          nickname?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          invited_by?: string | null
          is_muted?: boolean | null
          joined_at?: string
          nickname?: string | null
          role?: Database["public"]["Enums"]["group_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "group_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      growth_config: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      hidden_conversations: {
        Row: {
          conversation_id: string
          hidden_at: string
          id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          hidden_at?: string
          id?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          hidden_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_conversations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_content: {
        Row: {
          content_type: string
          content_url: string | null
          created_at: string
          description: string | null
          display_order: number | null
          ends_at: string | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          pillar: string
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content_type: string
          content_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          pillar: string
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content_type?: string
          content_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          ends_at?: string | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          pillar?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      invite_redemptions: {
        Row: {
          id: string
          invite_id: string
          redeemed_at: string
          redeemer_id: string
        }
        Insert: {
          id?: string
          invite_id: string
          redeemed_at?: string
          redeemer_id: string
        }
        Update: {
          id?: string
          invite_id?: string
          redeemed_at?: string
          redeemer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_redemptions_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "invites"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          invite_code: string
          inviter_id: string
          max_uses: number | null
          use_count: number | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          invite_code: string
          inviter_id: string
          max_uses?: number | null
          use_count?: number | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          invite_code?: string
          inviter_id?: string
          max_uses?: number | null
          use_count?: number | null
        }
        Relationships: []
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          document_type: string
          document_version: string
          id: string
          ip_address: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_type: string
          document_version: string
          id?: string
          ip_address?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_type?: string
          document_version?: string
          id?: string
          ip_address?: string | null
          user_id?: string
        }
        Relationships: []
      }
      licensed_tracks: {
        Row: {
          artist: string
          artwork_url: string | null
          audio_url: string
          created_at: string
          duration: number
          genre: string | null
          preview_url: string
          provider_id: string
          title: string
          track_id: string
          updated_at: string
        }
        Insert: {
          artist: string
          artwork_url?: string | null
          audio_url: string
          created_at?: string
          duration: number
          genre?: string | null
          preview_url: string
          provider_id: string
          title: string
          track_id: string
          updated_at?: string
        }
        Update: {
          artist?: string
          artwork_url?: string | null
          audio_url?: string
          created_at?: string
          duration?: number
          genre?: string | null
          preview_url?: string
          provider_id?: string
          title?: string
          track_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "licensed_tracks_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "music_providers"
            referencedColumns: ["provider_id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      listing_favorites: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "listing_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      listings: {
        Row: {
          category: string
          condition: string
          created_at: string
          description: string | null
          id: string
          images: string[] | null
          location: string | null
          price: number
          seller_id: string
          status: string
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          category: string
          condition?: string
          created_at?: string
          description?: string | null
          id?: string
          images?: string[] | null
          location?: string | null
          price?: number
          seller_id: string
          status?: string
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          category?: string
          condition?: string
          created_at?: string
          description?: string | null
          id?: string
          images?: string[] | null
          location?: string | null
          price?: number
          seller_id?: string
          status?: string
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      live_activity: {
        Row: {
          activity_type: string
          community_id: string
          id: string
          last_seen_at: string | null
          room_id: string | null
          started_at: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          community_id: string
          id?: string
          last_seen_at?: string | null
          room_id?: string | null
          started_at?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          community_id?: string
          id?: string
          last_seen_at?: string | null
          room_id?: string | null
          started_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_activity_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_activity_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "public_servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_activity_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_activity_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_activity_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_widgets: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          is_visible: boolean | null
          position: Json | null
          size: string | null
          updated_at: string | null
          user_id: string
          widget_type: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          position?: Json | null
          size?: string | null
          updated_at?: string | null
          user_id: string
          widget_type: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          is_visible?: boolean | null
          position?: Json | null
          size?: string | null
          updated_at?: string | null
          user_id?: string
          widget_type?: string
        }
        Relationships: []
      }
      login_streaks: {
        Row: {
          created_at: string
          current_streak: number
          id: string
          last_login_date: string | null
          longest_streak: number
          streak_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          id?: string
          last_login_date?: string | null
          longest_streak?: number
          streak_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          id?: string
          last_login_date?: string | null
          longest_streak?: number
          streak_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      marketplace_purchases: {
        Row: {
          cost: number
          id: string
          item_id: string
          purchased_at: string
          user_id: string
        }
        Insert: {
          cost: number
          id?: string
          item_id: string
          purchased_at?: string
          user_id: string
        }
        Update: {
          cost?: number
          id?: string
          item_id?: string
          purchased_at?: string
          user_id?: string
        }
        Relationships: []
      }
      meme_ban_backgrounds: {
        Row: {
          created_at: string
          created_by: string | null
          gif_url: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gif_url: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gif_url?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      message_deletions: {
        Row: {
          deleted_at: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          deleted_at?: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          deleted_at?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_deletions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_deletions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "message_deletions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_deletions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_deletions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      message_pins: {
        Row: {
          created_at: string
          id: string
          label: string | null
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "message_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_pins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      message_requests: {
        Row: {
          created_at: string
          id: string
          message_preview: string | null
          receiver_id: string
          responded_at: string | null
          sender_id: string
          status: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_preview?: string | null
          receiver_id: string
          responded_at?: string | null
          sender_id: string
          status?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_preview?: string | null
          receiver_id?: string
          responded_at?: string | null
          sender_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "message_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "message_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "message_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      message_views: {
        Row: {
          id: string
          message_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          message_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_views_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "message_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      messages: {
        Row: {
          auto_delete_if_ignored: boolean | null
          blur_on_screenshot: boolean | null
          can_undo_until: string | null
          content: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_for_users: string[] | null
          edited_at: string | null
          expires_at: string | null
          id: string
          ignore_deadline: string | null
          is_deleted: boolean | null
          is_edited: boolean | null
          media_type: string | null
          media_url: string | null
          message_type: string | null
          reply_to_id: string | null
          sender_id: string
          view_mode: string | null
          viewed_at: string | null
          voice_segments: Json | null
        }
        Insert: {
          auto_delete_if_ignored?: boolean | null
          blur_on_screenshot?: boolean | null
          can_undo_until?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_for_users?: string[] | null
          edited_at?: string | null
          expires_at?: string | null
          id?: string
          ignore_deadline?: string | null
          is_deleted?: boolean | null
          is_edited?: boolean | null
          media_type?: string | null
          media_url?: string | null
          message_type?: string | null
          reply_to_id?: string | null
          sender_id: string
          view_mode?: string | null
          viewed_at?: string | null
          voice_segments?: Json | null
        }
        Update: {
          auto_delete_if_ignored?: boolean | null
          blur_on_screenshot?: boolean | null
          can_undo_until?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_for_users?: string[] | null
          edited_at?: string | null
          expires_at?: string | null
          id?: string
          ignore_deadline?: string | null
          is_deleted?: boolean | null
          is_edited?: boolean | null
          media_type?: string | null
          media_url?: string | null
          message_type?: string | null
          reply_to_id?: string | null
          sender_id?: string
          view_mode?: string | null
          viewed_at?: string | null
          voice_segments?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      moderator_applications: {
        Row: {
          admin_notes: string | null
          availability: string | null
          created_at: string
          experience: string | null
          id: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          availability?: string | null
          created_at?: string
          experience?: string | null
          id?: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          availability?: string | null
          created_at?: string
          experience?: string | null
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderator_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "moderator_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderator_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderator_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "moderator_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "moderator_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderator_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderator_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      mood_states: {
        Row: {
          detected_at: string | null
          id: string
          intensity: number | null
          mood: string
          source: string | null
          user_id: string
        }
        Insert: {
          detected_at?: string | null
          id?: string
          intensity?: number | null
          mood: string
          source?: string | null
          user_id: string
        }
        Update: {
          detected_at?: string | null
          id?: string
          intensity?: number | null
          mood?: string
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      music_providers: {
        Row: {
          api_base_url: string
          api_key: string
          created_at: string
          is_active: boolean
          provider_id: string
          provider_name: string
        }
        Insert: {
          api_base_url: string
          api_key: string
          created_at?: string
          is_active?: boolean
          provider_id?: string
          provider_name: string
        }
        Update: {
          api_base_url?: string
          api_key?: string
          created_at?: string
          is_active?: boolean
          provider_id?: string
          provider_name?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          announcements_enabled: boolean | null
          comments_enabled: boolean | null
          created_at: string
          dms_enabled: boolean | null
          dnd_enabled: boolean | null
          dnd_until: string | null
          events_enabled: boolean | null
          follows_enabled: boolean | null
          id: string
          likes_enabled: boolean | null
          marketplace_enabled: boolean | null
          mentions_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          system_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          announcements_enabled?: boolean | null
          comments_enabled?: boolean | null
          created_at?: string
          dms_enabled?: boolean | null
          dnd_enabled?: boolean | null
          dnd_until?: string | null
          events_enabled?: boolean | null
          follows_enabled?: boolean | null
          id?: string
          likes_enabled?: boolean | null
          marketplace_enabled?: boolean | null
          mentions_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          system_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          announcements_enabled?: boolean | null
          comments_enabled?: boolean | null
          created_at?: string
          dms_enabled?: boolean | null
          dnd_enabled?: boolean | null
          dnd_until?: string | null
          events_enabled?: boolean | null
          follows_enabled?: boolean | null
          id?: string
          likes_enabled?: boolean | null
          marketplace_enabled?: boolean | null
          mentions_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          system_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          post_id: string | null
          read: boolean
          reason: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          reason?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          reason?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          order_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          order_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount: number
          buyer_id: string
          created_at: string
          id: string
          listing_id: string
          payment_type: string | null
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_id: string
          created_at?: string
          id?: string
          listing_id: string
          payment_type?: string | null
          seller_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_id?: string
          created_at?: string
          id?: string
          listing_id?: string
          payment_type?: string | null
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      parallel_feeds: {
        Row: {
          created_at: string | null
          feed_type: string
          filters: Json | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          feed_type?: string
          filters?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          feed_type?: string
          filters?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          user_id?: string
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string
          handle: string
          id: string
          is_enabled: boolean | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          handle: string
          id?: string
          is_enabled?: boolean | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          handle?: string
          id?: string
          is_enabled?: boolean | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_methods_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      phone_verifications: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          phone: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          id?: string
          phone: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
        }
        Relationships: []
      }
      post_collaborators: {
        Row: {
          added_at: string
          id: string
          post_id: string
          role: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          post_id: string
          role?: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          post_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_collaborators_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          ai_confidence: number | null
          ai_override: boolean | null
          author_id: string
          caption: string | null
          created_at: string
          filter_id: string | null
          has_profanity: boolean | null
          id: string
          is_ai_generated: boolean | null
          is_pinned: boolean | null
          is_sensitive: boolean | null
          media_url: string | null
          media_urls: string[] | null
          sound_id: string | null
          sound_start_time: number | null
          tags: string[] | null
          thumbnail_url: string | null
          trending_score: number | null
          type: string
          view_count: number | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_override?: boolean | null
          author_id: string
          caption?: string | null
          created_at?: string
          filter_id?: string | null
          has_profanity?: boolean | null
          id?: string
          is_ai_generated?: boolean | null
          is_pinned?: boolean | null
          is_sensitive?: boolean | null
          media_url?: string | null
          media_urls?: string[] | null
          sound_id?: string | null
          sound_start_time?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          trending_score?: number | null
          type: string
          view_count?: number | null
        }
        Update: {
          ai_confidence?: number | null
          ai_override?: boolean | null
          author_id?: string
          caption?: string | null
          created_at?: string
          filter_id?: string | null
          has_profanity?: boolean | null
          id?: string
          is_ai_generated?: boolean | null
          is_pinned?: boolean | null
          is_sensitive?: boolean | null
          media_url?: string | null
          media_urls?: string[] | null
          sound_id?: string | null
          sound_start_time?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          trending_score?: number | null
          type?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "posts_filter_id_fkey"
            columns: ["filter_id"]
            isOneToOne: false
            referencedRelation: "filters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_sound_id_fkey"
            columns: ["sound_id"]
            isOneToOne: false
            referencedRelation: "sounds"
            referencedColumns: ["sound_id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_verified: boolean | null
          avatar_url: string | null
          badge_settings: Json | null
          bio: string | null
          coins_balance: number | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          equipped_badge_id: string | null
          equipped_effect: string | null
          equipped_frame: string | null
          equipped_name_color: string | null
          equipped_profile_theme: string | null
          equipped_title: string | null
          first_name: string | null
          founder_badge_seen: boolean | null
          id: string
          interests: string[] | null
          intro_completed: boolean | null
          is_premium: boolean | null
          is_private: boolean | null
          is_verified: boolean | null
          language: string | null
          last_name: string | null
          link_url: string | null
          location: string | null
          music_personality: string | null
          onboarding_completed: boolean | null
          phone_number: string | null
          phone_verified: boolean | null
          premium_expires_at: string | null
          referral_inviter_id: string | null
          sensitivity_preference: string | null
          stripe_customer_id: string | null
          timezone: string | null
          tracking_consent: string | null
          tutorial_completed: boolean | null
          tutorial_skipped: boolean | null
          user_id: string | null
          username: string
        }
        Insert: {
          age_verified?: boolean | null
          avatar_url?: string | null
          badge_settings?: Json | null
          bio?: string | null
          coins_balance?: number | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          equipped_badge_id?: string | null
          equipped_effect?: string | null
          equipped_frame?: string | null
          equipped_name_color?: string | null
          equipped_profile_theme?: string | null
          equipped_title?: string | null
          first_name?: string | null
          founder_badge_seen?: boolean | null
          id?: string
          interests?: string[] | null
          intro_completed?: boolean | null
          is_premium?: boolean | null
          is_private?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_name?: string | null
          link_url?: string | null
          location?: string | null
          music_personality?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          phone_verified?: boolean | null
          premium_expires_at?: string | null
          referral_inviter_id?: string | null
          sensitivity_preference?: string | null
          stripe_customer_id?: string | null
          timezone?: string | null
          tracking_consent?: string | null
          tutorial_completed?: boolean | null
          tutorial_skipped?: boolean | null
          user_id?: string | null
          username: string
        }
        Update: {
          age_verified?: boolean | null
          avatar_url?: string | null
          badge_settings?: Json | null
          bio?: string | null
          coins_balance?: number | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          email?: string | null
          equipped_badge_id?: string | null
          equipped_effect?: string | null
          equipped_frame?: string | null
          equipped_name_color?: string | null
          equipped_profile_theme?: string | null
          equipped_title?: string | null
          first_name?: string | null
          founder_badge_seen?: boolean | null
          id?: string
          interests?: string[] | null
          intro_completed?: boolean | null
          is_premium?: boolean | null
          is_private?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_name?: string | null
          link_url?: string | null
          location?: string | null
          music_personality?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          phone_verified?: boolean | null
          premium_expires_at?: string | null
          referral_inviter_id?: string | null
          sensitivity_preference?: string | null
          stripe_customer_id?: string | null
          timezone?: string | null
          tracking_consent?: string | null
          tutorial_completed?: boolean | null
          tutorial_skipped?: boolean | null
          user_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_equipped_badge_id_fkey"
            columns: ["equipped_badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referral_inviter_id_fkey"
            columns: ["referral_inviter_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "profiles_referral_inviter_id_fkey"
            columns: ["referral_inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referral_inviter_id_fkey"
            columns: ["referral_inviter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referral_inviter_id_fkey"
            columns: ["referral_inviter_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          id: string
          key: string
          request_count: number
          window_start: string
        }
        Insert: {
          id?: string
          key: string
          request_count?: number
          window_start?: string
        }
        Update: {
          id?: string
          key?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      reaction_streaks: {
        Row: {
          created_at: string
          current_streak: number
          id: string
          last_interaction_at: string
          last_user_a_at: string | null
          last_user_b_at: string | null
          longest_streak: number
          streak_started_at: string | null
          updated_at: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          id?: string
          last_interaction_at?: string
          last_user_a_at?: string | null
          last_user_b_at?: string | null
          longest_streak?: number
          streak_started_at?: string | null
          updated_at?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          id?: string
          last_interaction_at?: string
          last_user_a_at?: string | null
          last_user_b_at?: string | null
          longest_streak?: number
          streak_started_at?: string | null
          updated_at?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "reaction_streaks_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reaction_streaks_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_streaks_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_streaks_user_a_fkey"
            columns: ["user_a"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reaction_streaks_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reaction_streaks_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_streaks_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reaction_streaks_user_b_fkey"
            columns: ["user_b"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      reports: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          post_id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          post_id: string
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          post_id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      roulette_matches: {
        Row: {
          conversation_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          mode: string
          shared_interests: string[] | null
          started_at: string
          status: string
          user_a: string
          user_b: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          mode?: string
          shared_interests?: string[] | null
          started_at?: string
          status?: string
          user_a: string
          user_b: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          mode?: string
          shared_interests?: string[] | null
          started_at?: string
          status?: string
          user_a?: string
          user_b?: string
        }
        Relationships: [
          {
            foreignKeyName: "roulette_matches_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      roulette_queue: {
        Row: {
          id: string
          interests: string[] | null
          joined_at: string
          mode: string
          user_id: string
        }
        Insert: {
          id?: string
          interests?: string[] | null
          joined_at?: string
          mode?: string
          user_id: string
        }
        Update: {
          id?: string
          interests?: string[] | null
          joined_at?: string
          mode?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_themes: {
        Row: {
          created_at: string
          id: string
          shared_theme_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shared_theme_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shared_theme_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_themes_shared_theme_id_fkey"
            columns: ["shared_theme_id"]
            isOneToOne: false
            referencedRelation: "shared_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_themes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "saved_themes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_themes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_themes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          media_type: string | null
          media_url: string | null
          reply_to_id: string | null
          scheduled_at: string
          sender_id: string
          sent_at: string | null
          status: string
          view_mode: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          reply_to_id?: string | null
          scheduled_at: string
          sender_id: string
          sent_at?: string | null
          status?: string
          view_mode?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          reply_to_id?: string | null
          scheduled_at?: string
          sender_id?: string
          sent_at?: string | null
          status?: string
          view_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "scheduled_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      screenshot_notifications: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screenshot_notifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "screenshot_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenshot_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      seller_ratings: {
        Row: {
          buyer_id: string
          created_at: string
          id: string
          rating: number
          review: string | null
          seller_id: string
        }
        Insert: {
          buyer_id: string
          created_at?: string
          id?: string
          rating: number
          review?: string | null
          seller_id: string
        }
        Update: {
          buyer_id?: string
          created_at?: string
          id?: string
          rating?: number
          review?: string | null
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seller_ratings_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "seller_ratings_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_ratings_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_ratings_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "seller_ratings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "seller_ratings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_ratings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seller_ratings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      server_members: {
        Row: {
          id: string
          joined_at: string
          nickname: string | null
          role: string
          server_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          nickname?: string | null
          role?: string
          server_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          nickname?: string | null
          role?: string
          server_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "public_servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "server_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      server_notifications: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          message_id: string
          read: boolean
          sender_id: string
          server_id: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          message_id: string
          read?: boolean
          sender_id: string
          server_id: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          message_id?: string
          read?: boolean
          sender_id?: string
          server_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "server_notifications_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_notifications_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "channel_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "server_notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "server_notifications_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_notifications_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "public_servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_notifications_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "server_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      servers: {
        Row: {
          active_now_count: number | null
          banner_url: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          invite_code: string | null
          is_public: boolean | null
          member_count: number | null
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          active_now_count?: number | null
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          invite_code?: string | null
          is_public?: boolean | null
          member_count?: number | null
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          active_now_count?: number | null
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          invite_code?: string | null
          is_public?: boolean | null
          member_count?: number | null
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      shared_themes: {
        Row: {
          category: string | null
          created_at: string
          creator_id: string
          description: string | null
          downloads_count: number | null
          id: string
          is_public: boolean | null
          layout_settings: Json | null
          likes_count: number | null
          preview_images: string[] | null
          tags: string[] | null
          theme_code: string | null
          theme_name: string
          theme_tokens: Json
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          downloads_count?: number | null
          id?: string
          is_public?: boolean | null
          layout_settings?: Json | null
          likes_count?: number | null
          preview_images?: string[] | null
          tags?: string[] | null
          theme_code?: string | null
          theme_name: string
          theme_tokens: Json
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          downloads_count?: number | null
          id?: string
          is_public?: boolean | null
          layout_settings?: Json | null
          likes_count?: number | null
          preview_images?: string[] | null
          tags?: string[] | null
          theme_code?: string | null
          theme_name?: string
          theme_tokens?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_themes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "shared_themes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_themes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_themes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      snap_recipients: {
        Row: {
          created_at: string
          id: string
          message_id: string
          opened: boolean | null
          opened_at: string | null
          recipient_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          opened?: boolean | null
          opened_at?: string | null
          recipient_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          opened?: boolean | null
          opened_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "snap_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      sound_analytics: {
        Row: {
          avg_watch_time: number
          growth_rate: number
          id: string
          plays: number
          plays_last_24h: number
          plays_last_7d: number
          recorded_at: string
          shares: number
          sound_id: string
          videos_created: number
        }
        Insert: {
          avg_watch_time?: number
          growth_rate?: number
          id?: string
          plays?: number
          plays_last_24h?: number
          plays_last_7d?: number
          recorded_at?: string
          shares?: number
          sound_id: string
          videos_created?: number
        }
        Update: {
          avg_watch_time?: number
          growth_rate?: number
          id?: string
          plays?: number
          plays_last_24h?: number
          plays_last_7d?: number
          recorded_at?: string
          shares?: number
          sound_id?: string
          videos_created?: number
        }
        Relationships: [
          {
            foreignKeyName: "sound_analytics_sound_id_fkey"
            columns: ["sound_id"]
            isOneToOne: false
            referencedRelation: "sounds"
            referencedColumns: ["sound_id"]
          },
        ]
      }
      sound_play_events: {
        Row: {
          context: string | null
          created_at: string
          id: string
          sound_id: string
          user_id: string | null
          watch_duration: number | null
        }
        Insert: {
          context?: string | null
          created_at?: string
          id?: string
          sound_id: string
          user_id?: string | null
          watch_duration?: number | null
        }
        Update: {
          context?: string | null
          created_at?: string
          id?: string
          sound_id?: string
          user_id?: string | null
          watch_duration?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sound_play_events_sound_id_fkey"
            columns: ["sound_id"]
            isOneToOne: false
            referencedRelation: "sounds"
            referencedColumns: ["sound_id"]
          },
        ]
      }
      sounds: {
        Row: {
          artist: string
          audio_url: string
          cover_url: string | null
          created_at: string
          duration: number
          is_approved: boolean
          is_explicit: boolean
          is_extracted: boolean
          is_original: boolean
          moderation_status: string
          original_creator_id: string | null
          original_video_id: string | null
          preview_url: string | null
          sound_id: string
          tags: string[] | null
          title: string
          trend_score: number
          updated_at: string
          uploader_id: string | null
          usage_count: number
          waveform_data: Json | null
        }
        Insert: {
          artist?: string
          audio_url: string
          cover_url?: string | null
          created_at?: string
          duration?: number
          is_approved?: boolean
          is_explicit?: boolean
          is_extracted?: boolean
          is_original?: boolean
          moderation_status?: string
          original_creator_id?: string | null
          original_video_id?: string | null
          preview_url?: string | null
          sound_id?: string
          tags?: string[] | null
          title: string
          trend_score?: number
          updated_at?: string
          uploader_id?: string | null
          usage_count?: number
          waveform_data?: Json | null
        }
        Update: {
          artist?: string
          audio_url?: string
          cover_url?: string | null
          created_at?: string
          duration?: number
          is_approved?: boolean
          is_explicit?: boolean
          is_extracted?: boolean
          is_original?: boolean
          moderation_status?: string
          original_creator_id?: string | null
          original_video_id?: string | null
          preview_url?: string | null
          sound_id?: string
          tags?: string[] | null
          title?: string
          trend_score?: number
          updated_at?: string
          uploader_id?: string | null
          usage_count?: number
          waveform_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "sounds_original_creator_id_fkey"
            columns: ["original_creator_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "sounds_original_creator_id_fkey"
            columns: ["original_creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sounds_original_creator_id_fkey"
            columns: ["original_creator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sounds_original_creator_id_fkey"
            columns: ["original_creator_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "sounds_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "sounds_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sounds_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sounds_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      space_participants: {
        Row: {
          id: string
          is_muted: boolean | null
          joined_at: string
          left_at: string | null
          raised_hand: boolean | null
          role: string
          space_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_muted?: boolean | null
          joined_at?: string
          left_at?: string | null
          raised_hand?: boolean | null
          role?: string
          space_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_muted?: boolean | null
          joined_at?: string
          left_at?: string | null
          raised_hand?: boolean | null
          role?: string
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_participants_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          allow_requests: boolean | null
          cover_image_url: string | null
          created_at: string
          daily_room_name: string | null
          daily_room_url: string | null
          description: string | null
          ended_at: string | null
          host_id: string
          id: string
          is_recording: boolean | null
          listener_count: number | null
          max_speakers: number | null
          peak_listeners: number | null
          recording_url: string | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          allow_requests?: boolean | null
          cover_image_url?: string | null
          created_at?: string
          daily_room_name?: string | null
          daily_room_url?: string | null
          description?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          is_recording?: boolean | null
          listener_count?: number | null
          max_speakers?: number | null
          peak_listeners?: number | null
          recording_url?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          allow_requests?: boolean | null
          cover_image_url?: string | null
          created_at?: string
          daily_room_name?: string | null
          daily_room_url?: string | null
          description?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          is_recording?: boolean | null
          listener_count?: number | null
          max_speakers?: number | null
          peak_listeners?: number | null
          recording_url?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      sponsor_analytics: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          event_type: string
          id: string
          sponsor_id: string
          user_id: string | null
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          event_type: string
          id?: string
          sponsor_id: string
          user_id?: string | null
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          event_type?: string
          id?: string
          sponsor_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_analytics_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "public_sponsor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_analytics_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsor_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_analytics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "sponsor_analytics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_analytics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_analytics_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      sponsor_profiles: {
        Row: {
          company_logo: string | null
          company_name: string
          contact_email: string | null
          created_at: string
          description: string | null
          id: string
          is_verified: boolean | null
          updated_at: string
          user_id: string
          verification_date: string | null
          website_url: string | null
        }
        Insert: {
          company_logo?: string | null
          company_name: string
          contact_email?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_verified?: boolean | null
          updated_at?: string
          user_id: string
          verification_date?: string | null
          website_url?: string | null
        }
        Update: {
          company_logo?: string | null
          company_name?: string
          contact_email?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_verified?: boolean | null
          updated_at?: string
          user_id?: string
          verification_date?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "sponsor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      stories: {
        Row: {
          aspect_ratio: number | null
          author_id: string
          caption: string | null
          created_at: string
          duration: number | null
          expires_at: string
          id: string
          is_close_friends_only: boolean | null
          like_count: number
          media_type: string
          media_url: string
          view_count: number | null
        }
        Insert: {
          aspect_ratio?: number | null
          author_id: string
          caption?: string | null
          created_at?: string
          duration?: number | null
          expires_at?: string
          id?: string
          is_close_friends_only?: boolean | null
          like_count?: number
          media_type?: string
          media_url: string
          view_count?: number | null
        }
        Update: {
          aspect_ratio?: number | null
          author_id?: string
          caption?: string | null
          created_at?: string
          duration?: number | null
          expires_at?: string
          id?: string
          is_close_friends_only?: boolean | null
          like_count?: number
          media_type?: string
          media_url?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stories_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "stories_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      story_likes: {
        Row: {
          created_at: string
          id: string
          story_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          story_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          story_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_likes_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "story_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          viewed_at: string
          viewer_id: string
        }
        Insert: {
          id?: string
          story_id: string
          viewed_at?: string
          viewer_id: string
        }
        Update: {
          id?: string
          story_id?: string
          viewed_at?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "story_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      streaks: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_message_at: string
          streak_count: number | null
          user1_id: string
          user2_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          last_message_at?: string
          streak_count?: number | null
          user1_id: string
          user2_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_message_at?: string
          streak_count?: number | null
          user1_id?: string
          user2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "streaks_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "streaks_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streaks_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streaks_user1_id_fkey"
            columns: ["user1_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "streaks_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "streaks_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streaks_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streaks_user2_id_fkey"
            columns: ["user2_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      stripe_config: {
        Row: {
          created_at: string
          id: string
          stripe_enabled: boolean
          stripe_mode: string
          stripe_publishable_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          stripe_enabled?: boolean
          stripe_mode?: string
          stripe_publishable_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          stripe_enabled?: boolean
          stripe_mode?: string
          stripe_publishable_key?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      theme_codes: {
        Row: {
          code: string
          created_at: string
          creator_id: string
          expires_at: string | null
          id: string
          max_uses: number | null
          theme_id: string
          uses_count: number | null
        }
        Insert: {
          code: string
          created_at?: string
          creator_id: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          theme_id: string
          uses_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          creator_id?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          theme_id?: string
          uses_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "theme_codes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "theme_codes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_codes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_codes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "theme_codes_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "shared_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      theme_likes: {
        Row: {
          created_at: string
          id: string
          shared_theme_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          shared_theme_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          shared_theme_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "theme_likes_shared_theme_id_fkey"
            columns: ["shared_theme_id"]
            isOneToOne: false
            referencedRelation: "shared_themes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "theme_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "theme_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      tips: {
        Row: {
          amount: number
          created_at: string
          creator_amount: number
          creator_id: string
          currency: string
          id: string
          message: string | null
          platform_fee: number
          status: string
          stripe_payment_intent_id: string | null
          tipper_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          creator_amount?: number
          creator_id: string
          currency?: string
          id?: string
          message?: string | null
          platform_fee?: number
          status?: string
          stripe_payment_intent_id?: string | null
          tipper_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          creator_amount?: number
          creator_id?: string
          currency?: string
          id?: string
          message?: string | null
          platform_fee?: number
          status?: string
          stripe_payment_intent_id?: string | null
          tipper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tips_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      token_transactions: {
        Row: {
          amount: number
          created_at: string | null
          description: string | null
          id: string
          reference_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          reference_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      track_usage: {
        Row: {
          id: string
          last_updated: string
          plays: number
          shares: number
          track_id: string
          trend_score: number
          videos_created: number
        }
        Insert: {
          id?: string
          last_updated?: string
          plays?: number
          shares?: number
          track_id: string
          trend_score?: number
          videos_created?: number
        }
        Update: {
          id?: string
          last_updated?: string
          plays?: number
          shares?: number
          track_id?: string
          trend_score?: number
          videos_created?: number
        }
        Relationships: [
          {
            foreignKeyName: "track_usage_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: true
            referencedRelation: "licensed_tracks"
            referencedColumns: ["track_id"]
          },
        ]
      }
      trashed_conversations: {
        Row: {
          auto_delete_at: string | null
          conversation_id: string
          id: string
          trashed_at: string
          user_id: string
        }
        Insert: {
          auto_delete_at?: string | null
          conversation_id: string
          id?: string
          trashed_at?: string
          user_id: string
        }
        Update: {
          auto_delete_at?: string | null
          conversation_id?: string
          id?: string
          trashed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trashed_conversations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trashed_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "trashed_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trashed_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trashed_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      typing_indicators: {
        Row: {
          conversation_id: string
          id: string
          started_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          started_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "typing_indicators_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_ai_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_backgrounds: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean | null
          name: string | null
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean | null
          name?: string | null
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean | null
          name?: string | null
          storage_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_backgrounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_backgrounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_backgrounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_backgrounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_badges: {
        Row: {
          awarded_by: string | null
          badge_id: string | null
          badge_name: string | null
          badge_type: string | null
          earned_at: string
          expires_at: string | null
          id: string
          is_pinned: boolean | null
          is_primary: boolean | null
          metadata: Json | null
          pin_order: number | null
          show_effect: boolean | null
          user_id: string
        }
        Insert: {
          awarded_by?: string | null
          badge_id?: string | null
          badge_name?: string | null
          badge_type?: string | null
          earned_at?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean | null
          is_primary?: boolean | null
          metadata?: Json | null
          pin_order?: number | null
          show_effect?: boolean | null
          user_id: string
        }
        Update: {
          awarded_by?: string | null
          badge_id?: string | null
          badge_name?: string | null
          badge_type?: string | null
          earned_at?: string
          expires_at?: string | null
          id?: string
          is_pinned?: boolean | null
          is_primary?: boolean | null
          metadata?: Json | null
          pin_order?: number | null
          show_effect?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_badges_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bans: {
        Row: {
          banned_by: string
          created_at: string
          custom_gif_url: string | null
          expires_at: string | null
          id: string
          is_meme_ban: boolean | null
          is_permanent: boolean
          reason: string
          user_id: string
        }
        Insert: {
          banned_by: string
          created_at?: string
          custom_gif_url?: string | null
          expires_at?: string | null
          id?: string
          is_meme_ban?: boolean | null
          is_permanent?: boolean
          reason: string
          user_id: string
        }
        Update: {
          banned_by?: string
          created_at?: string
          custom_gif_url?: string | null
          expires_at?: string | null
          id?: string
          is_meme_ban?: boolean | null
          is_permanent?: boolean
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_bans_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_bans_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_bans_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_bans_banned_by_fkey"
            columns: ["banned_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_checkins: {
        Row: {
          created_at: string
          id: string
          is_private: boolean | null
          mood_rating: number | null
          prompt_id: string | null
          response: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_private?: boolean | null
          mood_rating?: number | null
          prompt_id?: string | null
          response?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_private?: boolean | null
          mood_rating?: number | null
          prompt_id?: string | null
          response?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_checkins_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "checkin_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_custom_sounds: {
        Row: {
          created_at: string | null
          duration_seconds: number
          file_name: string
          file_url: string
          id: string
          sound_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds: number
          file_name: string
          file_url: string
          id?: string
          sound_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number
          file_name?: string
          file_url?: string
          id?: string
          sound_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_sounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_custom_sounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_custom_sounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_custom_sounds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_interactions: {
        Row: {
          created_at: string
          duration_seconds: number | null
          id: string
          interaction_type: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          interaction_type: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          id?: string
          interaction_type?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_interactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_interactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_levels: {
        Row: {
          created_at: string
          current_level: number
          id: string
          total_xp: number
          unclaimed_rewards: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_level?: number
          id?: string
          total_xp?: number
          unclaimed_rewards?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_level?: number
          id?: string
          total_xp?: number
          unclaimed_rewards?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          button_sound: string | null
          clips_muted: boolean | null
          created_at: string
          dismissed_quick_add_ids: string[] | null
          explore_view_mode: string | null
          extra: Json | null
          id: string
          intro_completed: boolean | null
          referral_confirmed: boolean | null
          unlocked_easter_eggs: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          button_sound?: string | null
          clips_muted?: boolean | null
          created_at?: string
          dismissed_quick_add_ids?: string[] | null
          explore_view_mode?: string | null
          extra?: Json | null
          id?: string
          intro_completed?: boolean | null
          referral_confirmed?: boolean | null
          unlocked_easter_eggs?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          button_sound?: string | null
          clips_muted?: boolean | null
          created_at?: string
          dismissed_quick_add_ids?: string[] | null
          explore_view_mode?: string | null
          extra?: Json | null
          id?: string
          intro_completed?: boolean | null
          referral_confirmed?: boolean | null
          unlocked_easter_eggs?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          id: string
          is_online: boolean
          last_seen_at: string
          user_id: string
        }
        Insert: {
          id?: string
          is_online?: boolean
          last_seen_at?: string
          user_id: string
        }
        Update: {
          id?: string
          is_online?: boolean
          last_seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_roles_auth: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_safety_settings: {
        Row: {
          break_reminder_interval_hours: number | null
          content_filter_level: string | null
          created_at: string
          dm_filter: string | null
          id: string
          message_requests_enabled: boolean | null
          muted_keywords: string[] | null
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          show_global_events: boolean | null
          take_a_break_reminder: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          break_reminder_interval_hours?: number | null
          content_filter_level?: string | null
          created_at?: string
          dm_filter?: string | null
          id?: string
          message_requests_enabled?: boolean | null
          muted_keywords?: string[] | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          show_global_events?: boolean | null
          take_a_break_reminder?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          break_reminder_interval_hours?: number | null
          content_filter_level?: string | null
          created_at?: string
          dm_filter?: string | null
          id?: string
          message_requests_enabled?: boolean | null
          muted_keywords?: string[] | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          show_global_events?: boolean | null
          take_a_break_reminder?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_safety_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_safety_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_safety_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_safety_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_saved_sounds: {
        Row: {
          created_at: string
          id: string
          sound_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sound_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sound_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_saved_sounds_sound_id_fkey"
            columns: ["sound_id"]
            isOneToOne: false
            referencedRelation: "sounds"
            referencedColumns: ["sound_id"]
          },
        ]
      }
      user_settings: {
        Row: {
          content_language: string[] | null
          created_at: string | null
          id: string
          read_receipts: boolean | null
          reduced_motion: boolean | null
          restrict_comments_to_followers: boolean | null
          screenshot_notifications: boolean | null
          show_activity_status: boolean | null
          theme: string | null
          typing_indicators: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content_language?: string[] | null
          created_at?: string | null
          id?: string
          read_receipts?: boolean | null
          reduced_motion?: boolean | null
          restrict_comments_to_followers?: boolean | null
          screenshot_notifications?: boolean | null
          show_activity_status?: boolean | null
          theme?: string | null
          typing_indicators?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content_language?: string[] | null
          created_at?: string | null
          id?: string
          read_receipts?: boolean | null
          reduced_motion?: boolean | null
          restrict_comments_to_followers?: boolean | null
          screenshot_notifications?: boolean | null
          show_activity_status?: boolean | null
          theme?: string | null
          typing_indicators?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      user_themes: {
        Row: {
          base_preset: string | null
          created_at: string
          id: string
          is_active: boolean | null
          theme_name: string | null
          theme_tokens: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          base_preset?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          theme_name?: string | null
          theme_tokens?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          base_preset?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          theme_name?: string | null
          theme_tokens?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_ui_settings: {
        Row: {
          config_version: number | null
          created_at: string
          id: string
          layout_settings: Json | null
          nav_settings: Json | null
          safe_mode: boolean | null
          theme_settings: Json | null
          ui_config: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          config_version?: number | null
          created_at?: string
          id?: string
          layout_settings?: Json | null
          nav_settings?: Json | null
          safe_mode?: boolean | null
          theme_settings?: Json | null
          ui_config?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          config_version?: number | null
          created_at?: string
          id?: string
          layout_settings?: Json | null
          nav_settings?: Json | null
          safe_mode?: boolean | null
          theme_settings?: Json | null
          ui_config?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_warnings: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          created_at: string
          id: string
          reason: string
          user_id: string
          warned_by: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          reason: string
          user_id: string
          warned_by: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          reason?: string
          user_id?: string
          warned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_warnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_warnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_warnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_warnings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_warnings_warned_by_fkey"
            columns: ["warned_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "user_warnings_warned_by_fkey"
            columns: ["warned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_warnings_warned_by_fkey"
            columns: ["warned_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_warnings_warned_by_fkey"
            columns: ["warned_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      vanish_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          media_type: string | null
          media_url: string | null
          sender_id: string
          thread_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          sender_id: string
          thread_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vanish_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "vanish_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vanish_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vanish_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "vanish_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "vanish_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      vanish_threads: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          title: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          title?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vanish_threads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vanish_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "vanish_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vanish_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vanish_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      video_stats: {
        Row: {
          avg_watch_time: number
          comments: number
          created_at: string
          creator_id: string
          id: string
          likes: number
          post_id: string
          qualified_views: number
          saves: number
          shares: number
          updated_at: string
          views: number
        }
        Insert: {
          avg_watch_time?: number
          comments?: number
          created_at?: string
          creator_id: string
          id?: string
          likes?: number
          post_id: string
          qualified_views?: number
          saves?: number
          shares?: number
          updated_at?: string
          views?: number
        }
        Update: {
          avg_watch_time?: number
          comments?: number
          created_at?: string
          creator_id?: string
          id?: string
          likes?: number
          post_id?: string
          qualified_views?: number
          saves?: number
          shares?: number
          updated_at?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_stats_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_stats_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      vybe_dna: {
        Row: {
          aura_intensity: number | null
          generated_at: string | null
          glyph_pattern: string | null
          id: string
          personality_vector: Json | null
          signature_colors: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aura_intensity?: number | null
          generated_at?: string | null
          glyph_pattern?: string | null
          id?: string
          personality_vector?: Json | null
          signature_colors?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aura_intensity?: number | null
          generated_at?: string | null
          glyph_pattern?: string | null
          id?: string
          personality_vector?: Json | null
          signature_colors?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      vybe_tokens: {
        Row: {
          balance: number | null
          id: string
          lifetime_earned: number | null
          lifetime_spent: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          id?: string
          lifetime_earned?: number | null
          lifetime_spent?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          id?: string
          lifetime_earned?: number | null
          lifetime_spent?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      word_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
          word_end: number
          word_start: number
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
          word_end: number
          word_start: number
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
          word_end?: number
          word_start?: number
        }
        Relationships: [
          {
            foreignKeyName: "word_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "word_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "word_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "word_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "word_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
    }
    Views: {
      business_profiles_public: {
        Row: {
          banner_url: string | null
          business_hours: Json | null
          category: string | null
          created_at: string | null
          description: string | null
          email: string | null
          id: string | null
          is_active: boolean | null
          is_verified: boolean | null
          location: string | null
          logo_url: string | null
          name: string | null
          owner_id: string | null
          phone: string | null
          rating_average: number | null
          rating_count: number | null
          slug: string | null
          social_links: Json | null
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean | null
          total_revenue: number | null
          total_sales: number | null
          updated_at: string | null
          view_count: number | null
          website: string | null
        }
        Insert: {
          banner_url?: string | null
          business_hours?: Json | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          email?: never
          id?: string | null
          is_active?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          name?: string | null
          owner_id?: string | null
          phone?: never
          rating_average?: number | null
          rating_count?: number | null
          slug?: string | null
          social_links?: Json | null
          stripe_account_id?: never
          stripe_onboarding_complete?: boolean | null
          total_revenue?: never
          total_sales?: number | null
          updated_at?: string | null
          view_count?: number | null
          website?: string | null
        }
        Update: {
          banner_url?: string | null
          business_hours?: Json | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          email?: never
          id?: string | null
          is_active?: boolean | null
          is_verified?: boolean | null
          location?: string | null
          logo_url?: string | null
          name?: string | null
          owner_id?: string | null
          phone?: never
          rating_average?: number | null
          rating_count?: number | null
          slug?: string | null
          social_links?: Json | null
          stripe_account_id?: never
          stripe_onboarding_complete?: boolean | null
          total_revenue?: never
          total_sales?: number | null
          updated_at?: string | null
          view_count?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "business_profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_profiles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      communities: {
        Row: {
          active_now_count: number | null
          banner_url: string | null
          cover_url: string | null
          created_at: string | null
          description: string | null
          icon_url: string | null
          id: string | null
          invite_code: string | null
          is_public: boolean | null
          member_count: number | null
          name: string | null
          owner_id: string | null
        }
        Insert: {
          active_now_count?: number | null
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string | null
          invite_code?: string | null
          is_public?: boolean | null
          member_count?: number | null
          name?: string | null
          owner_id?: string | null
        }
        Update: {
          active_now_count?: number | null
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string | null
          invite_code?: string | null
          is_public?: boolean | null
          member_count?: number | null
          name?: string | null
          owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string | null
          id: string | null
          joined_at: string | null
          nickname: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          community_id?: string | null
          id?: string | null
          joined_at?: string | null
          nickname?: string | null
          role?: never
          user_id?: string | null
        }
        Update: {
          community_id?: string | null
          id?: string | null
          joined_at?: string | null
          nickname?: string | null
          role?: never
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "public_servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_server_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "server_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "server_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      invite_leaderboard: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          invite_count: number | null
          profile_id: string | null
          rank: number | null
          username: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          age_verified: boolean | null
          avatar_url: string | null
          badge_settings: Json | null
          bio: string | null
          coins_balance: number | null
          created_at: string | null
          date_of_birth: string | null
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string | null
          interests: string[] | null
          intro_completed: boolean | null
          is_private: boolean | null
          is_verified: boolean | null
          language: string | null
          last_name: string | null
          link_url: string | null
          location: string | null
          onboarding_completed: boolean | null
          phone_number: string | null
          phone_verified: boolean | null
          referral_inviter_id: string | null
          sensitivity_preference: string | null
          timezone: string | null
          tutorial_completed: boolean | null
          tutorial_skipped: boolean | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          age_verified?: never
          avatar_url?: string | null
          badge_settings?: Json | null
          bio?: string | null
          coins_balance?: number | null
          created_at?: string | null
          date_of_birth?: never
          display_name?: string | null
          email?: never
          first_name?: never
          id?: string | null
          interests?: string[] | null
          intro_completed?: boolean | null
          is_private?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_name?: never
          link_url?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          phone_number?: never
          phone_verified?: never
          referral_inviter_id?: never
          sensitivity_preference?: never
          timezone?: string | null
          tutorial_completed?: boolean | null
          tutorial_skipped?: boolean | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          age_verified?: never
          avatar_url?: string | null
          badge_settings?: Json | null
          bio?: string | null
          coins_balance?: number | null
          created_at?: string | null
          date_of_birth?: never
          display_name?: string | null
          email?: never
          first_name?: never
          id?: string | null
          interests?: string[] | null
          intro_completed?: boolean | null
          is_private?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_name?: never
          link_url?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          phone_number?: never
          phone_verified?: never
          referral_inviter_id?: never
          sensitivity_preference?: never
          timezone?: string | null
          tutorial_completed?: boolean | null
          tutorial_skipped?: boolean | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      public_servers: {
        Row: {
          active_now_count: number | null
          banner_url: string | null
          cover_url: string | null
          created_at: string | null
          description: string | null
          icon_url: string | null
          id: string | null
          is_public: boolean | null
          member_count: number | null
          name: string | null
          owner_id: string | null
          updated_at: string | null
        }
        Insert: {
          active_now_count?: number | null
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string | null
          is_public?: boolean | null
          member_count?: number | null
          name?: string | null
          owner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          active_now_count?: number | null
          banner_url?: string | null
          cover_url?: string | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string | null
          is_public?: boolean | null
          member_count?: number | null
          name?: string | null
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servers_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      public_sponsor_profiles: {
        Row: {
          company_logo: string | null
          company_name: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_verified: boolean | null
          updated_at: string | null
          user_id: string | null
          verification_date: string | null
          website_url: string | null
        }
        Insert: {
          company_logo?: string | null
          company_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_verified?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          verification_date?: string | null
          website_url?: string | null
        }
        Update: {
          company_logo?: string | null
          company_name?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_verified?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          verification_date?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "invite_leaderboard"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "sponsor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "xp_leaderboard"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      rooms: {
        Row: {
          community_id: string | null
          created_at: string | null
          description: string | null
          id: string | null
          is_private: boolean | null
          name: string | null
          position: number | null
          room_type: string | null
          type: string | null
        }
        Insert: {
          community_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_private?: boolean | null
          name?: string | null
          position?: number | null
          room_type?: string | null
          type?: string | null
        }
        Update: {
          community_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          is_private?: boolean | null
          name?: string | null
          position?: number | null
          room_type?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_server_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_server_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "public_servers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_server_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_leaderboard: {
        Row: {
          avatar_url: string | null
          current_level: number | null
          display_name: string | null
          is_verified: boolean | null
          profile_id: string | null
          rank: number | null
          total_xp: number | null
          user_id: string | null
          username: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_user_xp: {
        Args: { p_user_id: string; p_xp_amount: number }
        Returns: Json
      }
      award_badge: {
        Args: {
          p_awarded_by?: string
          p_badge_id: string
          p_expires_at?: string
          p_user_id: string
        }
        Returns: string
      }
      bump_reaction_streak: { Args: { p_other_user: string }; Returns: Json }
      calculate_creator_earnings: { Args: never; Returns: Json }
      calculate_level_from_xp: { Args: { p_xp: number }; Returns: number }
      can_send_dm: {
        Args: { receiver_id: string; sender_id: string }
        Returns: boolean
      }
      check_and_grant_owner_badges: { Args: never; Returns: undefined }
      check_channel_permission: {
        Args: { p_channel_id: string; p_permission: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          p_key: string
          p_max_requests: number
          p_window_seconds?: number
        }
        Returns: boolean
      }
      claim_challenge_reward: {
        Args: { p_reward_id: string; p_user_id: string }
        Returns: Json
      }
      claim_profile_by_email: { Args: never; Returns: string }
      cleanup_expired_reset_tokens: { Args: never; Returns: undefined }
      cleanup_old_error_logs: { Args: never; Returns: undefined }
      cleanup_old_friend_drops: { Args: never; Returns: undefined }
      cleanup_stale_challenges: { Args: never; Returns: undefined }
      clear_conversation_messages: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: Json
      }
      compute_vybe_dna: { Args: never; Returns: Json }
      confirm_referral_atomic: {
        Args: {
          p_inviter_profile_id: string
          p_inviter_user_id: string
          p_redeemer_auth_id: string
        }
        Returns: Json
      }
      create_default_rooms: {
        Args: { p_server_id: string }
        Returns: undefined
      }
      create_dm_conversation: {
        Args: { other_profile_id: string }
        Returns: string
      }
      create_group_chat: {
        Args: {
          p_creator_profile_id: string
          p_member_profile_ids: string[]
          p_name: string
        }
        Returns: {
          group_id: string
          group_name: string
        }[]
      }
      current_profile_id: { Args: never; Returns: string }
      current_user_has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      earn_vybe_tokens: {
        Args: {
          p_amount: number
          p_description?: string
          p_reference_id?: string
          p_type: string
          p_user_id: string
        }
        Returns: number
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_profile: { Args: never; Returns: string }
      execute_admin_sql: { Args: { sql_query: string }; Returns: Json }
      filter_profanity: { Args: { input_text: string }; Returns: string }
      find_roulette_match: {
        Args: { p_interests?: string[]; p_mode?: string }
        Returns: Json
      }
      fire_push_notification: {
        Args: {
          p_body: string
          p_tag?: string
          p_title: string
          p_type?: string
          p_url?: string
          p_user_id: string
        }
        Returns: undefined
      }
      force_sync_my_challenges: { Args: never; Returns: undefined }
      generate_invite_code: { Args: never; Returns: string }
      generate_order_number: { Args: never; Returns: string }
      generate_theme_code: { Args: never; Returns: string }
      get_auth_id_for_profile: {
        Args: { _profile_id: string }
        Returns: string
      }
      get_auth_users_count: { Args: never; Returns: number }
      get_comment_count: { Args: { p_post_id: string }; Returns: number }
      get_creator_revenue_split: {
        Args: {
          p_source: string
          p_tier: Database["public"]["Enums"]["creator_tier"]
        }
        Returns: number
      }
      get_dm_safety_level: {
        Args: { user1_id: string; user2_id: string }
        Returns: string
      }
      get_follower_count: { Args: { profile_id: string }; Returns: number }
      get_following_count: { Args: { profile_id: string }; Returns: number }
      get_following_posts_with_counts: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_type?: string
          p_user_id: string
        }
        Returns: {
          author_avatar_url: string
          author_id: string
          author_username: string
          caption: string
          comment_count: number
          created_at: string
          id: string
          is_bookmarked: boolean
          is_liked: boolean
          is_pinned: boolean
          like_count: number
          media_url: string
          media_urls: string[]
          tags: string[]
          thumbnail_url: string
          type: string
          view_count: number
        }[]
      }
      get_friend_profile_by_id: {
        Args: { current_user_profile_id: string; target_id: string }
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          display_name: string
          id: string
          is_private: boolean
          is_verified: boolean
          link_url: string
          location: string
          username: string
        }[]
      }
      get_like_count: { Args: { p_post_id: string }; Returns: number }
      get_login_streak_status:
        | { Args: never; Returns: Json }
        | { Args: { p_timezone?: string }; Returns: Json }
      get_mutual_friends: {
        Args: { current_user_id: string; target_user_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
        }[]
      }
      get_owner_auth_id: { Args: never; Returns: string }
      get_owner_wife_auth_id: { Args: never; Returns: string }
      get_personalized_feed: {
        Args: {
          p_interests?: string[]
          p_limit?: number
          p_offset?: number
          p_type?: string
          p_user_id: string
        }
        Returns: {
          author_avatar_url: string
          author_id: string
          author_username: string
          caption: string
          comment_count: number
          created_at: string
          id: string
          is_bookmarked: boolean
          is_liked: boolean
          is_pinned: boolean
          like_count: number
          media_url: string
          media_urls: string[]
          relevance_score: number
          tags: string[]
          thumbnail_url: string
          type: string
          view_count: number
        }[]
      }
      get_posts_with_counts: {
        Args: {
          p_author_id?: string
          p_limit?: number
          p_offset?: number
          p_type?: string
          p_user_id?: string
        }
        Returns: {
          author_avatar_url: string
          author_id: string
          author_username: string
          caption: string
          comment_count: number
          created_at: string
          id: string
          is_bookmarked: boolean
          is_liked: boolean
          is_pinned: boolean
          like_count: number
          media_url: string
          media_urls: string[]
          tags: string[]
          thumbnail_url: string
          type: string
          view_count: number
        }[]
      }
      get_profile_by_id: {
        Args: { target_id: string }
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          display_name: string
          id: string
          is_private: boolean
          is_verified: boolean
          user_id: string
          username: string
        }[]
      }
      get_profile_by_username: {
        Args: { target_username: string }
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          display_name: string
          id: string
          is_private: boolean
          is_verified: boolean
          user_id: string
          username: string
        }[]
      }
      get_profile_id_for_auth: { Args: { _auth_id: string }; Returns: string }
      get_profile_posts_rpc: {
        Args: { profile_id_input: string; viewer_id_input?: string }
        Returns: {
          comments_count: number
          content: string
          created_at: string
          has_poll: boolean
          id: string
          is_bookmarked: boolean
          is_liked: boolean
          is_pinned: boolean
          likes_count: number
          media_type: string
          media_url: string
          poll_ends_at: string
          poll_options: Json
          poll_question: string
          user_id: string
        }[]
      }
      get_public_profile_by_id: {
        Args: { target_id: string }
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          display_name: string
          id: string
          is_private: boolean
          is_verified: boolean
          username: string
        }[]
      }
      get_ranked_feed: {
        Args: {
          p_content_type?: string
          p_page?: number
          p_page_size?: number
          p_user_id: string
        }
        Returns: {
          author_avatar: string
          author_id: string
          author_username: string
          caption: string
          comment_count: number
          created_at: string
          is_bookmarked: boolean
          is_liked: boolean
          is_pinned: boolean
          like_count: number
          media_url: string
          media_urls: string[]
          post_id: string
          post_type: string
          rank_score: number
          tags: string[]
          thumbnail_url: string
          view_count: number
        }[]
      }
      get_server_role: { Args: { p_server_id: string }; Returns: string }
      get_trending_feed: {
        Args: { p_content_type?: string; p_page?: number; p_page_size?: number }
        Returns: {
          author_avatar: string
          author_id: string
          author_username: string
          caption: string
          comment_count: number
          created_at: string
          is_pinned: boolean
          like_count: number
          media_url: string
          media_urls: string[]
          post_id: string
          post_type: string
          rank_score: number
          tags: string[]
          thumbnail_url: string
          view_count: number
        }[]
      }
      get_user_badges_by_profile: {
        Args: { p_profile_id: string }
        Returns: {
          badge_category: string
          badge_description: string
          badge_effect: string
          badge_gradient_from: string
          badge_gradient_to: string
          badge_gradient_via: string
          badge_icon: string
          badge_id: string
          badge_is_animated: boolean
          badge_name: string
          badge_priority: number
          earned_at: string
          expires_at: string
          id: string
          is_pinned: boolean
          is_primary: boolean
          pin_order: number
          show_effect: boolean
          user_id: string
        }[]
      }
      get_user_primary_badge: {
        Args: { p_user_id: string }
        Returns: {
          category: string
          effect: string
          gradient_from: string
          gradient_to: string
          gradient_via: string
          icon: string
          id: string
          is_animated: boolean
          name: string
          priority: number
        }[]
      }
      get_winning_ad: {
        Args: {
          p_placement: Database["public"]["Enums"]["ad_placement"]
          p_viewer_id?: string
        }
        Returns: {
          advertiser_id: string
          body_text: string
          campaign_id: string
          cta_text: string
          cta_url: string
          headline: string
          media_url: string
        }[]
      }
      grant_owner_all_badges:
        | { Args: never; Returns: undefined }
        | { Args: { p_owner_user_id: string }; Returns: undefined }
      grant_post_xp: {
        Args: { p_content_type?: string; p_user_id: string }
        Returns: Json
      }
      has_gifted_premium: { Args: { p_user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_challenge_progress: {
        Args: { p_requirement_type: string; p_user_id: string }
        Returns: undefined
      }
      increment_sound_usage: {
        Args: { p_sound_id: string }
        Returns: undefined
      }
      increment_theme_downloads: {
        Args: { theme_id: string }
        Returns: undefined
      }
      increment_view_count: {
        Args: { post_id_param: string }
        Returns: undefined
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_call_participant_via_profiles: {
        Args: { call_id_param: string }
        Returns: boolean
      }
      is_conversation_member: { Args: { conv_id: string }; Returns: boolean }
      is_conversation_member_for_presence: {
        Args: { conv_id: string }
        Returns: boolean
      }
      is_group_member_via_profiles: {
        Args: { conv_id: string }
        Returns: boolean
      }
      is_member_of_conversation: {
        Args: { _conversation_id: string }
        Returns: boolean
      }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      is_server_member: { Args: { p_server_id: string }; Returns: boolean }
      is_stripe_enabled: { Args: never; Returns: boolean }
      is_username_available: { Args: { p_username: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      process_due_scheduled_messages: {
        Args: { limit_count?: number }
        Returns: number
      }
      purchase_marketplace_item: {
        Args: { p_cost: number; p_description?: string; p_item_id: string }
        Returns: Json
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_ad_impression: {
        Args: {
          p_campaign_id: string
          p_clicked?: boolean
          p_viewer_id?: string
        }
        Returns: undefined
      }
      restore_login_streak: { Args: { p_timezone?: string }; Returns: Json }
      rotate_challenges: { Args: never; Returns: undefined }
      set_active_background: {
        Args: { p_background_id: string }
        Returns: undefined
      }
      sync_my_challenge_progress: { Args: never; Returns: undefined }
      sync_user_challenge_progress: {
        Args: { p_auth_user_id: string }
        Returns: undefined
      }
      track_daily_login: { Args: never; Returns: Json }
      trigger_badge_sync_for_user: {
        Args: { p_username: string }
        Returns: undefined
      }
      update_login_streak:
        | { Args: never; Returns: Json }
        | { Args: { p_timezone?: string }; Returns: Json }
      update_post_trending_score: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      update_sound_trend_scores: { Args: never; Returns: undefined }
      update_track_usage: {
        Args: {
          p_plays?: number
          p_shares?: number
          p_track_id: string
          p_videos_created?: number
        }
        Returns: undefined
      }
      update_trending_scores: { Args: never; Returns: Json }
      use_theme_code: { Args: { p_code: string }; Returns: string }
      validate_invite_code: {
        Args: { _code: string }
        Returns: {
          expires_at: string
          id: string
          invite_code: string
          max_uses: number
          use_count: number
        }[]
      }
    }
    Enums: {
      ad_placement: "feed_inline" | "story" | "boosted_post" | "sidebar"
      ad_status:
        | "draft"
        | "pending_review"
        | "active"
        | "paused"
        | "completed"
        | "rejected"
      app_role: "admin" | "moderator" | "user" | "owner_wife" | "owner"
      badge_category:
        | "role"
        | "patreon"
        | "referral"
        | "challenge"
        | "achievement"
        | "beta"
        | "special"
      creator_tier: "none" | "emerging" | "verified" | "elite"
      group_role: "owner" | "admin" | "member"
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
    Enums: {
      ad_placement: ["feed_inline", "story", "boosted_post", "sidebar"],
      ad_status: [
        "draft",
        "pending_review",
        "active",
        "paused",
        "completed",
        "rejected",
      ],
      app_role: ["admin", "moderator", "user", "owner_wife", "owner"],
      badge_category: [
        "role",
        "patreon",
        "referral",
        "challenge",
        "achievement",
        "beta",
        "special",
      ],
      creator_tier: ["none", "emerging", "verified", "elite"],
      group_role: ["owner", "admin", "member"],
    },
  },
} as const
