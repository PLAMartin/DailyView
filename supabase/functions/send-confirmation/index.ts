import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Daily View <hello@dailyview.org>',
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
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: err }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
