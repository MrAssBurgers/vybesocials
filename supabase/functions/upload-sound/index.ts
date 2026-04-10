import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, display_name, username")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const title = (formData.get("title") as string) || "Untitled Sound";
    const tagsRaw = formData.get("tags") as string;
    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const duration = parseFloat(formData.get("duration") as string) || 0;

    if (!audioFile) {
      return new Response(JSON.stringify({ error: "No audio file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate file size (max 20MB)
    if (audioFile.size > 20 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File too large (max 20MB)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload to storage
    const ext = audioFile.name.split(".").pop() || "mp3";
    const filePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("sounds")
      .upload(filePath, audioFile, {
        contentType: audioFile.type || "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return new Response(JSON.stringify({ error: "Failed to upload audio" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: urlData } = supabase.storage.from("sounds").getPublicUrl(filePath);
    const audioUrl = urlData.publicUrl;

    // AI content moderation for explicit content
    let isExplicit = false;
    let moderationStatus = "approved"; // Auto-approve for now, AI scan runs async
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (LOVABLE_API_KEY && title) {
      try {
        const moderationResp = await fetch(
          "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                {
                  role: "system",
                  content:
                    'You are a content moderation classifier. Given a song/sound title and tags, determine if it is likely explicit (sexual, violent, drug-related). Respond with ONLY a JSON object: {"is_explicit": true/false}',
                },
                {
                  role: "user",
                  content: `Title: "${title}"\nTags: ${tags.join(", ")}`,
                },
              ],
            }),
          }
        );

        if (moderationResp.ok) {
          const modData = await moderationResp.json();
          const content = modData.choices?.[0]?.message?.content || "";
          try {
            const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, "").trim());
            isExplicit = parsed.is_explicit === true;
          } catch {
            // Fallback: not explicit
          }
        }
      } catch (e) {
        console.error("Moderation check failed:", e);
      }
    }

    // Insert sound record
    const { data: sound, error: insertError } = await supabase
      .from("sounds")
      .insert({
        title,
        artist: profile.display_name || profile.username || "Unknown",
        uploader_id: profile.id,
        audio_url: audioUrl,
        preview_url: audioUrl,
        duration,
        tags,
        is_original: true,
        is_extracted: false,
        is_approved: true,
        is_explicit: isExplicit,
        moderation_status: moderationStatus,
      })
      .select("sound_id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save sound" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Award XP for uploading
    try {
      await supabase.rpc("add_user_xp", {
        p_user_id: user.id,
        p_xp: 10,
      });
    } catch {
      // Non-critical
    }

    return new Response(
      JSON.stringify({
        success: true,
        sound_id: sound.sound_id,
        is_explicit: isExplicit,
        audio_url: audioUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("upload-sound error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
