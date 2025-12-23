import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: "new_message" | "status_change";
  ticket_id: string;
  message?: string;
  new_status?: string;
  sender_name?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { type, ticket_id, message, new_status, sender_name }: NotificationRequest = await req.json();

    console.log(`Processing notification: ${type} for ticket ${ticket_id}`);

    // Get ticket details
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select(`
        *,
        creator:profiles!tickets_created_by_fkey(email, full_name),
        assignee:profiles!tickets_assigned_to_fkey(email, full_name)
      `)
      .eq("id", ticket_id)
      .single();

    if (ticketError || !ticket) {
      console.error("Ticket not found:", ticketError);
      throw new Error("Ticket not found");
    }

    const recipients: string[] = [];
    
    if (ticket.creator?.email) {
      recipients.push(ticket.creator.email);
    }
    
    if (ticket.assignee?.email) {
      recipients.push(ticket.assignee.email);
    }

    const uniqueRecipients = [...new Set(recipients)];

    if (uniqueRecipients.length === 0) {
      console.log("No recipients found");
      return new Response(JSON.stringify({ success: true, message: "No recipients" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let subject = "";
    let htmlContent = "";

    if (type === "new_message") {
      subject = `[MeuChapa #${ticket.ticket_number}] Nova mensagem: ${ticket.title}`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">MeuChapa</h1>
          </div>
          <div style="padding: 20px; background: #f9fafb;">
            <h2 style="color: #1f2937;">Nova mensagem no chamado #${ticket.ticket_number}</h2>
            <p><strong>Título:</strong> ${ticket.title}</p>
            <p><strong>De:</strong> ${sender_name || "Sistema"}</p>
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #f97316;">
              <p style="margin: 0;">${message}</p>
            </div>
            <p style="color: #6b7280; font-size: 12px;">
              Você pode responder diretamente a este e-mail para adicionar uma mensagem ao chamado.
            </p>
          </div>
        </div>
      `;
    } else if (type === "status_change") {
      subject = `[MeuChapa #${ticket.ticket_number}] Status alterado: ${new_status}`;
      htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #f97316, #ea580c); padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">MeuChapa</h1>
          </div>
          <div style="padding: 20px; background: #f9fafb;">
            <h2 style="color: #1f2937;">Status do chamado atualizado</h2>
            <p><strong>Chamado:</strong> #${ticket.ticket_number} - ${ticket.title}</p>
            <p><strong>Novo status:</strong> <span style="background: #f97316; color: white; padding: 4px 12px; border-radius: 12px;">${new_status}</span></p>
          </div>
        </div>
      `;
    }

    console.log(`Sending email to: ${uniqueRecipients.join(", ")}`);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "MeuChapa <onboarding@resend.dev>",
        to: uniqueRecipients,
        subject,
        html: htmlContent,
        reply_to: `ticket-${ticket_id}@inbound.meuchapa.com`,
      }),
    });

    const emailData = await emailResponse.json();
    console.log("Email sent:", emailData);

    return new Response(JSON.stringify({ success: true, emailResponse: emailData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
