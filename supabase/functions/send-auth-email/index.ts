import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

// Supabase "Send Email" auth hook. Without this, Supabase sends magic-link and
// password-reset emails itself, from its built-in SMTP sender
// (noreply@mail.app.supabase.io) using the stock templates — while every other
// Daily View email (invite, waitlist confirmation) goes out through Resend as
// "Daily View <support@dailyview.org>". Recipients noticed the mismatch.
//
// This routes Supabase's own auth emails through the same Resend sender, with
// the templates living here in the repo alongside send-invite-email rather than
// in the Supabase dashboard.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const HOOK_SECRET = Deno.env.get('SEND_EMAIL_HOOK_SECRET')!;

const FROM = 'Daily View <support@dailyview.org>';
const SITE_URL = 'https://www.dailyview.org';

interface EmailData {
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
}

interface Template {
  subject: string;
  heading: string;
  intro: string;
  button: string;
  // Reassurance shown in small print. Every template gets an "ignore this"
  // line, since these emails can be triggered by anyone who knows an address.
  ignore: string;
}

const TEMPLATES: Record<string, Template> = {
  magiclink: {
    subject: 'Your Daily View sign-in link',
    heading: 'Sign in to Daily View',
    intro: 'Use the button below to sign in. The link works once, and expires in about an hour.',
    button: 'Sign in',
    ignore: "If you didn't ask to sign in, you can safely ignore this email.",
  },
  recovery: {
    subject: 'Reset your Daily View password',
    heading: 'Choose a new password',
    intro: 'Use the button below to set a new password for your Daily View account. The link works once, and expires in about an hour.',
    button: 'Choose a new password',
    ignore: "If you didn't ask to reset your password, you can safely ignore this email. Your current password will keep working.",
  },
  signup: {
    subject: 'Confirm your Daily View email address',
    heading: 'Confirm your email address',
    intro: 'Use the button below to confirm this email address and finish setting up your Daily View account.',
    button: 'Confirm email address',
    ignore: "If you didn't create a Daily View account, you can safely ignore this email.",
  },
  invite: {
    subject: "You've been invited to Daily View",
    heading: "You're invited to Daily View",
    intro: 'Use the button below to accept your invite and set up your Daily View sign-in.',
    button: 'Accept invite',
    ignore: "If you weren't expecting this invite, you can safely ignore this email.",
  },
  email_change: {
    subject: 'Confirm your new Daily View email address',
    heading: 'Confirm your new email address',
    intro: 'Use the button below to confirm this address as the new email for your Daily View account.',
    button: 'Confirm email address',
    ignore: "If you didn't ask to change your email address, please contact us at support@dailyview.org.",
  },
};

// Anything Supabase sends that has a link but no template of its own still gets
// a branded email rather than silently vanishing.
const FALLBACK: Template = {
  subject: 'Confirm your Daily View request',
  heading: 'Confirm your request',
  intro: 'Use the button below to confirm this request on your Daily View account.',
  button: 'Confirm',
  ignore: "If you didn't make this request, you can safely ignore this email.",
};

function verifyLink(data: EmailData): string {
  const params = new URLSearchParams({
    token: data.token_hash,
    type: data.email_action_type,
    redirect_to: data.redirect_to || SITE_URL,
  });
  return `${SUPABASE_URL}/auth/v1/verify?${params.toString()}`;
}

function renderHtml(template: Template, link: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a2b6d;">
      <h1 style="font-size: 24px; margin-bottom: 8px; margin-top: 8px;">${template.heading}</h1>
      <p style="font-size: 16px; line-height: 1.6; color: #3d4e87;">${template.intro}</p>
      <p style="margin: 28px 0;">
        <a href="${link}" style="background: #1a2b6d; color: #fff; font-weight: 600; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block;">${template.button}</a>
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #6878a8;">
        Or copy this link into your browser:<br>
        <a href="${link}" style="color: #1a4fd6;">${link}</a>
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #6878a8;">${template.ignore}</p>
      <p style="font-size: 14px; color: #6878a8; margin-top: 32px;">
        Daily View · <a href="${SITE_URL}/legal/privacy-policy.html" style="color: #6878a8;">Privacy Policy</a>
      </p>
    </div>
  `;
}

serve(async (req) => {
  // Supabase calls this hook server-to-server, so there is no browser preflight
  // and deliberately no CORS allowance — unlike the functions the site invokes.
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: { http_code: 405, message: 'method not allowed' } }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload = await req.text();

  // The hook runs unauthenticated, so the Standard Webhooks signature is the
  // only thing separating a real Supabase call from anyone who finds the URL.
  // Reject before doing any work, and never echo the payload back.
  let body: { user: { email: string }; email_data: EmailData };
  try {
    const headers = Object.fromEntries(req.headers);
    const wh = new Webhook(HOOK_SECRET.replace('v1,whsec_', ''));
    body = wh.verify(payload, headers) as typeof body;
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 401, message: 'invalid signature' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = body.email_data;
  const template = TEMPLATES[data.email_action_type] || FALLBACK;

  // Notification-only action types carry no token_hash and need no link. There
  // is nothing to send, and failing here would block the auth operation.
  if (!data.token_hash) {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: body.user.email,
      subject: template.subject,
      html: renderHtml(template, verifyLink(data)),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Returning an error here surfaces the failure to the caller (e.g. the
    // login page's "we couldn't send that link" path) rather than telling the
    // visitor to go and check an inbox nothing was delivered to.
    console.error('resend send failed', data.email_action_type, res.status, detail);
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: 'could not send email' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
