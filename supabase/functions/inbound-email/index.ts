import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { timingSafeEqual } from "https://deno.land/std@0.190.0/crypto/timing_safe_equal.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Verify Resend/Svix webhook signature
async function verifyWebhookSignature(
  payload: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string
): Promise<boolean> {
  // Resend uses Svix for webhooks - extract the base64 secret (after "whsec_" prefix)
  const secretBytes = Uint8Array.from(atob(secret.replace("whsec_", "")), c => c.charCodeAt(0));
  
  // Create the signed payload
  const signedPayload = `${svixId}.${svixTimestamp}.${payload}`;
  
  // Import key for HMAC
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  // Generate expected signature
  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload)
  );
  
  const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)));
  
  // Parse the signatures from the header (format: "v1,signature1 v1,signature2")
  const signatures = svixSignature.split(" ").map(s => s.split(",")[1]);
  
  // Check if any signature matches
  for (const sig of signatures) {
    if (sig && sig.length === expectedSignature.length) {
      const sigBytes = new TextEncoder().encode(sig);
      const expectedBytes = new TextEncoder().encode(expectedSignature);
      if (timingSafeEqual(sigBytes, expectedBytes)) {
        return true;
      }
    }
  }
  
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook signature from Resend
    const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("RESEND_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      console.error("Missing webhook signature headers");
      return new Response(JSON.stringify({ error: "Missing signature headers" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check timestamp to prevent replay attacks (5 minute tolerance)
    const timestamp = parseInt(svixTimestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      console.error("Webhook timestamp too old");
      return new Response(JSON.stringify({ error: "Timestamp too old" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.text();
    
    const isValid = await verifyWebhookSignature(body, svixId, svixTimestamp, svixSignature, webhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(body);
    console.log("Received verified inbound email:", JSON.stringify(payload, null, 2));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { from, to, subject, text, html } = payload;

    // Extract ticket ID from recipient email (e.g., ticket-uuid@inbound.meuchapa.com)
    const ticketMatch = to?.match(/ticket-([a-f0-9-]+)@/i);
    
    if (!ticketMatch) {
      console.log("No ticket ID found in recipient email");
      return new Response(JSON.stringify({ success: false, message: "No ticket ID found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ticketId = ticketMatch[1];
    console.log(`Processing email for ticket: ${ticketId}`);

    // Find the sender by email
    const senderEmail = from?.match(/<(.+)>/)?.[1] || from;
    
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", senderEmail)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Sender not found:", profileError);
      return new Response(JSON.stringify({ success: false, message: "Sender not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify the ticket exists and user has access
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id, created_by, assigned_to")
      .eq("id", ticketId)
      .single();

    if (ticketError || !ticket) {
      console.error("Ticket not found:", ticketError);
      return new Response(JSON.stringify({ success: false, message: "Ticket not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user has permission (either creator, assignee, or staff)
    const { data: isStaff } = await supabase.rpc("is_staff", { _user_id: profile.id });
    
    const hasAccess = 
      ticket.created_by === profile.id || 
      ticket.assigned_to === profile.id || 
      isStaff;

    if (!hasAccess) {
      console.error("User does not have access to this ticket");
      return new Response(JSON.stringify({ success: false, message: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean the email content (remove signatures, quoted text)
    let cleanContent = text || "";
    
    // Remove common email signatures and quoted content
    cleanContent = cleanContent
      .split(/\n--\n/)[0] // Remove signature after "--"
      .split(/\nOn .+ wrote:\n/)[0] // Remove "On ... wrote:" quoted text
      .split(/\n>+/)[0] // Remove quoted lines starting with >
      .trim();

    if (!cleanContent) {
      cleanContent = "Resposta via e-mail (sem conteúdo de texto)";
    }

    // Insert the message
    const { data: message, error: messageError } = await supabase
      .from("ticket_messages")
      .insert({
        ticket_id: ticketId,
        sender_id: profile.id,
        content: cleanContent,
      })
      .select()
      .single();

    if (messageError) {
      console.error("Error creating message:", messageError);
      throw new Error("Failed to create message");
    }

    console.log("Message created successfully:", message.id);

    return new Response(JSON.stringify({ success: true, message_id: message.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error processing inbound email:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
