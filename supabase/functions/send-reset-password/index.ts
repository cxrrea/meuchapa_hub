import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const resendApiKey = Deno.env.get("RESEND_API_KEY")
const supabaseUrl = Deno.env.get("SUPABASE_URL")
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

interface RequestBody {
  email: string
  redirectTo?: string
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Validate request method
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: corsHeaders }
      )
    }

    const { email, redirectTo } = (await req.json()) as RequestBody

    // Validate input
    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: corsHeaders }
      )
    }

    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured")
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: corsHeaders }
      )
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

    // Check if user exists
    const { data: user, error: userError } = await supabase.auth.admin.getUserByEmail(email)

    if (userError || !user) {
      // Don't reveal if email exists for security
      console.log(`User not found: ${email}`)
      return new Response(
        JSON.stringify({ 
          success: true,
          message: "If an account exists with this email, a reset link has been sent"
        }),
        { status: 200, headers: corsHeaders }
      )
    }

    // Generate password reset link using Supabase
    const { data, error: resetError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectTo || `${new URL(req.url).origin}/reset-password`,
      },
    })

    if (resetError) {
      console.error("Reset link generation error:", resetError)
      return new Response(
        JSON.stringify({ error: "Failed to generate reset link" }),
        { status: 500, headers: corsHeaders }
      )
    }

    if (!data.properties?.action_link) {
      console.error("No action link generated")
      return new Response(
        JSON.stringify({ error: "Failed to generate reset link" }),
        { status: 500, headers: corsHeaders }
      )
    }

    // Get user profile for name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single()

    const userName = profile?.full_name || "Usuário"
    const resetLink = data.properties.action_link

    // Send email using Resend
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "noreply@meuchapahub.com",
        to: email,
        subject: "Recupere sua senha - MeuChapa Support Hub",
        html: generateResetEmailHtml(userName, resetLink),
      }),
    })

    const responseData = await response.json()

    if (!response.ok) {
      console.error("Resend API error:", responseData)
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: corsHeaders }
      )
    }

    console.log(`Password reset email sent to ${email}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password reset email sent successfully",
      }),
      { status: 200, headers: corsHeaders }
    )
  } catch (error) {
    console.error("Unexpected error:", error)
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    )
  }
})

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

function generateResetEmailHtml(name: string, resetLink: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px 20px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { color: #666; font-size: 12px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Recuperar Senha</h1>
          </div>
          <div class="content">
            <p>Olá <strong>${name}</strong>,</p>
            
            <p>Recebemos uma solicitação para recuperar sua senha no MeuChapa Support Hub. Clique no botão abaixo para definir uma nova senha:</p>
            
            <a href="${resetLink}" class="button">Recuperar Senha</a>
            
            <p style="color: #666; font-size: 14px;">Ou copie e cole este link no seu navegador:</p>
            <p style="word-break: break-all; color: #667eea; font-size: 12px;"><a href="${resetLink}">${resetLink}</a></p>
            
            <p style="color: #666; margin-top: 30px;">Este link expira em 24 horas.</p>
            
            <p style="color: #666;">Se você não solicitou a recuperação de senha, ignore este email.</p>
          </div>
          <div class="footer">
            <p>© 2024 MeuChapa Support Hub. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `
}
