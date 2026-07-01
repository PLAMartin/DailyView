import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, name } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: 'email required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const greeting = name ? `Hi ${name},` : 'Hi there,';

    const client = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: {
          username: 'dailyviewhq@gmail.com',
          password: Deno.env.get('GMAIL_APP_PASSWORD')!,
        },
      },
    });

    await client.send({
      from: 'Daily View <support@dailyview.org>',
      to: email,
      subject: "You're on the Daily View waitlist",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a2b6d;">
          <p style="font-size: 16px; line-height: 1.6; color: #3d4e87; margin-bottom: 4px;">${greeting}</p>
          <h1 style="font-size: 24px; margin-bottom: 8px; margin-top: 8px;">You're on the Daily View waitlist</h1>
          <p style="font-size: 16px; line-height: 1.6; color: #3d4e87;">
            We'll be in touch when Daily View is ready. We'll only contact you with
            occasional updates — no spam.
          </p>
          <p style="font-size: 16px; line-height: 1.6; color: #3d4e87;">
            In the meantime, you can see a sample Daily View screen at
            <a href="https://dailyview.vercel.app" style="color: #1a2b6d;">dailyview.vercel.app</a>.
          </p>
          <p style="font-size: 14px; color: #6878a8; margin-top: 32px;">
            Daily View · <a href="https://dailyview.org/legal/privacy-policy.html" style="color: #6878a8;">Privacy Policy</a>
          </p>
        </div>
      `,
    });

    await client.close();

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
