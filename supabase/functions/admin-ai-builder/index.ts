import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyAdmin(supabaseClient: any, req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
  if (userError || !userData.user) throw new Error("Unauthorized");

  const { data: rolesAuth } = await supabaseClient
    .from("user_roles_auth")
    .select("role")
    .eq("user_id", userData.user.id);
  let isAdmin = rolesAuth?.some((r: any) => r.role === "admin" || r.role === "owner");

  if (!isAdmin) {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (profile) {
      const { data: roles } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", profile.id);
      isAdmin = roles?.some((r: any) => r.role === "admin" || r.role === "owner");
    }
  }
  if (!isAdmin) throw new Error("Forbidden: admin only");
  return userData.user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    await verifyAdmin(supabaseClient, req);

    const body = await req.json();
    const { action } = body;

    // ── SQL Execution action ──
    if (action === "execute_sql") {
      const { sql } = body;
      if (!sql || typeof sql !== "string" || sql.trim().length === 0) {
        return new Response(JSON.stringify({ error: "SQL query string is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Length limit to prevent resource exhaustion
      if (sql.length > 10000) {
        return new Response(JSON.stringify({ error: "SQL query too long (max 10000 characters)" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Strip SQL comments to prevent bypass via comment injection
      const sqlNoComments = sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')  // block comments
        .replace(/--[^\n]*/g, ' ');          // line comments

      // Comprehensive regex-based blocklist (case-insensitive, whitespace-tolerant)
      const BLOCKED_PATTERNS: [RegExp, string][] = [
        [/\bDROP\s+(DATABASE|SCHEMA)\b/i, "DROP DATABASE/SCHEMA"],
        [/\bALTER\s+(DATABASE|SCHEMA)\b/i, "ALTER DATABASE/SCHEMA"],
        [/\bTRUNCATE\b/i, "TRUNCATE"],
        [/\b(GRANT|REVOKE)\b/i, "GRANT/REVOKE (privilege escalation)"],
        [/\bCOPY\b/i, "COPY (file system access)"],
        [/\bPG_READ_FILE\b/i, "pg_read_file"],
        [/\bPG_WRITE_FILE\b/i, "pg_write_file"],
        [/\bLO_IMPORT\b/i, "lo_import"],
        [/\bLO_EXPORT\b/i, "lo_export"],
        [/\bDBLINK\b/i, "dblink"],
        [/\bCREATE\s+EXTENSION\b/i, "CREATE EXTENSION"],
        [/\bCREATE\s+ROLE\b/i, "CREATE ROLE"],
        [/\bALTER\s+ROLE\b/i, "ALTER ROLE"],
        [/\bDROP\s+ROLE\b/i, "DROP ROLE"],
        [/\bCREATE\s+USER\b/i, "CREATE USER"],
        [/\bALTER\s+USER\b/i, "ALTER USER"],
        [/\bSET\s+ROLE\b/i, "SET ROLE"],
        [/\bSET\s+SESSION\s+AUTHORIZATION\b/i, "SET SESSION AUTHORIZATION"],
        [/\bCREATE\s+FUNCTION\b/i, "CREATE FUNCTION"],
        [/\bCREATE\s+OR\s+REPLACE\s+FUNCTION\b/i, "CREATE OR REPLACE FUNCTION"],
        [/\bCREATE\s+TRIGGER\b/i, "CREATE TRIGGER"],
        [/\bCREATE\s+POLICY\b/i, "CREATE POLICY"],
        [/\bDROP\s+POLICY\b/i, "DROP POLICY"],
        [/\bALTER\s+TABLE\s+.*\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b/i, "DISABLE RLS"],
      ];

      for (const [pattern, label] of BLOCKED_PATTERNS) {
        if (pattern.test(sqlNoComments)) {
          return new Response(JSON.stringify({ error: `Blocked: "${label}" is not allowed via SQL editor` }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      try {
        // Use the service-role client to call our secure SQL function
        const { data, error: rpcError } = await supabaseClient.rpc('execute_admin_sql', {
          sql_query: sql,
        });

        if (rpcError) {
          // Sanitize error message - don't leak internal details
          const safeMsg = rpcError.message?.replace(/\b(password|secret|key|token)\b[^\s]*/gi, '[REDACTED]');
          return new Response(JSON.stringify({ error: `SQL error: ${safeMsg}` }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if the function returned an error object
        if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
          const safeErr = String(data.error).replace(/\b(password|secret|key|token)\b[^\s]*/gi, '[REDACTED]');
          return new Response(JSON.stringify({ error: safeErr, detail: data.detail }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ 
          success: true, 
          result: data ?? [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (sqlErr: any) {
        return new Response(JSON.stringify({ error: "SQL execution failed" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── AI Chat action (default) ──
    const { messages } = body;
    if (!messages || !Array.isArray(messages)) {
      throw new Error("messages array is required");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are VYBE Admin AI — a powerful assistant embedded in the VYBE app's admin DevTools panel. You help admin users manage, debug, and build features for the VYBE social media platform.

You have deep knowledge of the VYBE app architecture:
- React + TypeScript + Tailwind CSS + Vite frontend
- Supabase backend (PostgreSQL, Edge Functions, Auth, Storage, Realtime)
- Key tables: profiles, posts, comments, likes, follows, conversations, messages, notifications, reports, user_roles, user_roles_auth, badges, user_badges, challenges, business_profiles, business_products, business_orders, events, communities, channels, analytics_events
- Stripe Connect for business payments
- AI features powered by Lovable AI Gateway
- Capacitor for native mobile (iOS/Android)

IMPORTANT — SQL EXECUTION:
You can execute SQL queries directly! When a user asks you to fix data, query the database, or make changes, you should provide the SQL and tell them to click the "Run SQL" button that appears with your code blocks. Format SQL in code blocks with the language tag \`sql\`.

When the user says "run it" or "execute it" after you provide SQL, respond with the SQL wrapped in a special format:
\`\`\`sql:execute
YOUR SQL HERE
\`\`\`

This will automatically trigger execution. Use this for:
- SELECT queries to inspect data
- UPDATE/INSERT/DELETE to fix data issues
- CREATE/ALTER for schema changes

Safety rules:
- Always use LIMIT on SELECT queries (max 100)
- Warn before destructive operations (DELETE, DROP, TRUNCATE)
- Never DROP DATABASE or DROP SCHEMA
- Show the query first and explain what it does before auto-executing

You can help admins with:
1. **Database Management**: Write & execute SQL queries, fix data issues, analyze tables
2. **Feature Planning**: Design new features, suggest implementation approaches
3. **Bug Diagnosis**: Analyze error logs, suggest fixes, explain error patterns
4. **Content Moderation**: Help with moderation strategies, flag patterns
5. **Performance**: Suggest optimizations, identify bottlenecks, indexing strategies
6. **Business Logic**: Stripe integration help, analytics queries
7. **Edge Functions**: Help write/debug Deno edge functions
8. **UI/UX**: Suggest component improvements, accessibility fixes

Format responses with markdown for readability. Use code blocks for SQL/code.
Be concise but thorough. Think step-by-step for complex requests.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.slice(-20),
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: message.includes("Forbidden") || message.includes("Unauthorized") ? 403 : 500,
    });
  }
});
