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
        ]
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
        ]
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
      challenges: {
        Row: {
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
          title: string
          type: string
        }
        Insert: {
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
          title: string
          type: string
        }
        Update: {
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
        ]
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
        ]
      }
      comments: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          post_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          post_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          post_id?: string
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
        ]
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
        ]
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
        ]
      }
      events: {
        Row: {
          cover_image: string | null
          created_at: string
          description: string | null
          end_time: string | null
          event_type: string
          host_id: string
          id: string
          is_public: boolean | null
          location: string | null
          max_attendees: number | null
          online_link: string | null
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_image?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_type?: string
          host_id: string
          id?: string
          is_public?: boolean | null
          location?: string | null
          max_attendees?: number | null
          online_link?: string | null
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          cover_image?: string | null
          created_at?: string
          description?: string | null
          end_time?: string | null
          event_type?: string
          host_id?: string
          id?: string
          is_public?: boolean | null
          location?: string | null
          max_attendees?: number | null
          online_link?: string | null
          start_time?: string
          title?: string
          updated_at?: string
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
        ]
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
        ]
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
        ]
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
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          post_id: string | null
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          post_id?: string | null
          read?: boolean
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
        ]
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
      posts: {
        Row: {
          author_id: string
          caption: string | null
          created_at: string
          id: string
          is_pinned: boolean | null
          is_sensitive: boolean | null
          media_url: string
          tags: string[] | null
          thumbnail_url: string | null
          type: string
          view_count: number | null
        }
        Insert: {
          author_id: string
          caption?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          is_sensitive?: boolean | null
          media_url: string
          tags?: string[] | null
          thumbnail_url?: string | null
          type: string
          view_count?: number | null
        }
        Update: {
          author_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          is_sensitive?: boolean | null
          media_url?: string
          tags?: string[] | null
          thumbnail_url?: string | null
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
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          badge_settings: Json | null
          bio: string | null
          coins_balance: number | null
          created_at: string
          display_name: string | null
          email: string | null
          first_name: string | null
          id: string
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
          username: string
        }
        Insert: {
          avatar_url?: string | null
          badge_settings?: Json | null
          bio?: string | null
          coins_balance?: number | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          interests?: string[] | null
          intro_completed?: boolean | null
          is_private?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_name?: string | null
          link_url?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          phone_verified?: boolean | null
          referral_inviter_id?: string | null
          sensitivity_preference?: string | null
          timezone?: string | null
          tutorial_completed?: boolean | null
          tutorial_skipped?: boolean | null
          user_id?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          badge_settings?: Json | null
          bio?: string | null
          coins_balance?: number | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          interests?: string[] | null
          intro_completed?: boolean | null
          is_private?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_name?: string | null
          link_url?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          phone_number?: string | null
          phone_verified?: boolean | null
          referral_inviter_id?: string | null
          sensitivity_preference?: string | null
          timezone?: string | null
          tutorial_completed?: boolean | null
          tutorial_skipped?: boolean | null
          user_id?: string | null
          username?: string
        }
        Relationships: [
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
        ]
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
        ]
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
        ]
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
        ]
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
        ]
      }
    }
    Views: {
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
          avatar_url: string | null
          bio: string | null
          coins_balance: number | null
          created_at: string | null
          display_name: string | null
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
          timezone: string | null
          tutorial_completed: boolean | null
          tutorial_skipped: boolean | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          coins_balance?: number | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string | null
          interests?: string[] | null
          intro_completed?: boolean | null
          is_private?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_name?: string | null
          link_url?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          timezone?: string | null
          tutorial_completed?: boolean | null
          tutorial_skipped?: boolean | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          coins_balance?: number | null
          created_at?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string | null
          interests?: string[] | null
          intro_completed?: boolean | null
          is_private?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_name?: string | null
          link_url?: string | null
          location?: string | null
          onboarding_completed?: boolean | null
          timezone?: string | null
          tutorial_completed?: boolean | null
          tutorial_skipped?: boolean | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
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
            referencedRelation: "servers"
            referencedColumns: ["id"]
          },
        ]
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
      calculate_level_from_xp: { Args: { p_xp: number }; Returns: number }
      check_and_grant_owner_badges: { Args: never; Returns: undefined }
      claim_challenge_reward: {
        Args: { p_reward_id: string; p_user_id: string }
        Returns: Json
      }
      claim_profile_by_email: { Args: never; Returns: string }
      cleanup_old_friend_drops: { Args: never; Returns: undefined }
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
      ensure_profile: { Args: never; Returns: string }
      filter_profanity: { Args: { input_text: string }; Returns: string }
      generate_invite_code: { Args: never; Returns: string }
      generate_theme_code: { Args: never; Returns: string }
      get_comment_count: { Args: { p_post_id: string }; Returns: number }
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
      get_mutual_friends: {
        Args: { current_user_id: string; target_user_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          username: string
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
      get_server_role: { Args: { p_server_id: string }; Returns: string }
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
          badge_id: string
          category: string
          effect: string
          gradient_from: string
          gradient_to: string
          gradient_via: string
          icon: string
          is_animated: boolean
          name: string
          priority: number
        }[]
      }
      grant_owner_all_badges:
        | { Args: never; Returns: undefined }
        | { Args: { p_owner_user_id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_theme_downloads: {
        Args: { theme_id: string }
        Returns: undefined
      }
      increment_view_count: {
        Args: { post_id_param: string }
        Returns: undefined
      }
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
      is_server_member: { Args: { p_server_id: string }; Returns: boolean }
      is_username_available: { Args: { p_username: string }; Returns: boolean }
      process_due_scheduled_messages: {
        Args: { limit_count?: number }
        Returns: number
      }
      set_active_background: {
        Args: { p_background_id: string }
        Returns: undefined
      }
      sync_my_challenge_progress: { Args: never; Returns: undefined }
      sync_user_challenge_progress: {
        Args: { p_auth_user_id: string }
        Returns: undefined
      }
      trigger_badge_sync_for_user: {
        Args: { p_username: string }
        Returns: undefined
      }
      use_theme_code: { Args: { p_code: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user" | "owner_wife"
      badge_category:
        | "role"
        | "patreon"
        | "referral"
        | "challenge"
        | "achievement"
        | "beta"
        | "special"
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
      app_role: ["admin", "moderator", "user", "owner_wife"],
      badge_category: [
        "role",
        "patreon",
        "referral",
        "challenge",
        "achievement",
        "beta",
        "special",
      ],
      group_role: ["owner", "admin", "member"],
    },
  },
} as const
