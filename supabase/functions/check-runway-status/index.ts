import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RUNWAY_API_KEY = Deno.env.get("RUNWAY_API_KEY");
    if (!RUNWAY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Runway API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { taskId } = await req.json();

    if (!taskId) {
      return new Response(
        JSON.stringify({ error: "Task ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Checking Runway task status:", taskId);

    const statusResponse = await fetch(`https://api.runwayml.com/v1/tasks/${taskId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${RUNWAY_API_KEY}`,
        "X-Runway-Version": "2024-11-06",
      },
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error("Runway status check error:", statusResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to check task status", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const taskData = await statusResponse.json();
    console.log("Runway task status:", taskData);

    // Map Runway statuses to our UI states
    let status = taskData.status;
    let videoUrl = null;
    let progress = 0;

    switch (taskData.status) {
      case "PENDING":
        progress = 10;
        break;
      case "RUNNING":
        progress = taskData.progress ? Math.round(taskData.progress * 100) : 50;
        break;
      case "SUCCEEDED":
        progress = 100;
        videoUrl = taskData.output?.[0] || taskData.artifacts?.[0]?.url;
        break;
      case "FAILED":
        progress = 0;
        break;
      case "CANCELLED":
        progress = 0;
        break;
    }

    return new Response(
      JSON.stringify({ 
        taskId,
        status,
        progress,
        videoUrl,
        error: taskData.failure || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in check-runway-status:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
