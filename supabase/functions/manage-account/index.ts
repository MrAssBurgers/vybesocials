import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = crypto.randomUUID().slice(0, 8);

  try {
    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User client to verify identity
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action } = await req.json();
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // ── DATA EXPORT ───────────────────────────────────────────
    if (action === "export") {
      console.log(`[${correlationId}] Data export for user ${user.id}`);

      const [profile, posts, comments, likes, bookmarks, messages, followers, following] = await Promise.all([
        adminClient.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        adminClient.from("posts").select("id, caption, type, media_url, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000),
        adminClient.from("comments").select("id, content, post_id, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1000),
        adminClient.from("likes").select("id, post_id, created_at").eq("user_id", user.id).limit(1000),
        adminClient.from("bookmarks").select("id, post_id, created_at").eq("user_id", user.id).limit(1000),
        adminClient.from("messages").select("id, content, conversation_id, created_at").eq("sender_id", user.id).order("created_at", { ascending: false }).limit(1000),
        adminClient.from("followers").select("follower_id, created_at").eq("following_id", user.id).limit(1000),
        adminClient.from("followers").select("following_id, created_at").eq("follower_id", user.id).limit(1000),
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        user_id: user.id,
        email: user.email,
        profile: profile.data,
        posts: posts.data || [],
        comments: comments.data || [],
        likes: likes.data || [],
        bookmarks: bookmarks.data || [],
        messages_sent: messages.data || [],
        followers: followers.data || [],
        following: following.data || [],
      };

      return new Response(
        JSON.stringify(exportData, null, 2),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="vybe-data-export-${new Date().toISOString().split("T")[0]}.json"`,
          },
        }
      );
    }

    // ── ACCOUNT DELETION ──────────────────────────────────────
    if (action === "delete") {
      console.log(`[${correlationId}] Account deletion for user ${user.id}`);

      // Delete user data in order (respecting foreign keys)
      // Most tables cascade from profile, but we clean up explicitly for safety
      const tables = [
        { table: "challenge_progress", column: "user_id" },
        { table: "challenge_rewards", column: "user_id" },
        { table: "bookmarks", column: "user_id" },
        { table: "likes", column: "user_id" },
        { table: "comments", column: "user_id" },
        { table: "notifications", column: "user_id" },
        { table: "followers", column: "follower_id" },
        { table: "followers", column: "following_id" },
        { table: "messages", column: "sender_id" },
        { table: "posts", column: "user_id" },
        { table: "user_badges", column: "user_id" },
        { table: "analytics_events", column: "user_id" },
        { table: "error_logs", column: "user_id" },
      ];

      for (const { table, column } of tables) {
        try {
          await adminClient.from(table).delete().eq(column, user.id);
        } catch (e) {
          console.warn(`[${correlationId}] Cleanup ${table}.${column} skipped:`, e);
        }
      }

      // Delete profile
      await adminClient.from("profiles").delete().eq("user_id", user.id);

      // Delete storage files
      try {
        const { data: files } = await adminClient.storage.from("media").list(user.id);
        if (files && files.length > 0) {
          const paths = files.map((f) => `${user.id}/${f.name}`);
          await adminClient.storage.from("media").remove(paths);
        }
      } catch (e) {
        console.warn(`[${correlationId}] Storage cleanup skipped:`, e);
      }

      // Delete the auth user last
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
      if (deleteError) {
        console.error(`[${correlationId}] Auth deletion failed:`, deleteError);
        return new Response(
          JSON.stringify({ error: "Failed to delete account. Please contact support." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[${correlationId}] Account deleted successfully`);
      return new Response(
        JSON.stringify({ success: true, message: "Account deleted successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'export' or 'delete'." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(`[${correlationId}] Error:`, error);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
