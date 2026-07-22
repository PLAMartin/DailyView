import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { checkInvite, corsHeaders, jsonResponse, SITE_URL } from '../_shared/invite.ts';

// Sends the invite email for a dv_account_invite row created by the
// dashboard's "Invite person" flow (dashboard/people.js). Deliberately does
// NOT trust client-supplied email/account/role content: the caller only
// proves it holds a real invite_id + token (the same secret pair used to
// redeem the invite), and every fact in the email is re-derived server-side
// from that row. Without this, a client-content email-sender would double as
// an open relay for sending arbitrary "Daily View"-branded email to
// arbitrary addresses.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const result = await checkInvite(body.invite_id, body.token);
    if (!result.ok) {
      return jsonResponse({ error: result.reason }, 410);
    }

    const invite = result.invite;
    const inviteLink = SITE_URL + '/accept-invite/?invite=' + invite.invite_id + '.' + body.token;
    const accountName = invite.dv_account?.account_name || 'Daily View';
    const role = invite.dv_account_user_role?.role;
    const inviterName = invite.dv_user?.full_name;

    const introLine = inviterName
      ? `${inviterName} has invited you to help manage ${accountName} on Daily View.`
      : `You've been invited to help manage ${accountName} on Daily View.`;
    const roleLine = role ? `You've been invited as: <strong>${role.replace(/_/g, ' ')}</strong>.` : '';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Daily View <support@dailyview.org>',
        to: invite.email,
        subject: `You've been invited to Daily View`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1a2b6d;">
            <h1 style="font-size: 24px; margin-bottom: 8px; margin-top: 8px;">You're invited to Daily View</h1>
            <p style="font-size: 16px; line-height: 1.6; color: #3d4e87;">${introLine}</p>
            ${roleLine ? `<p style="font-size: 16px; line-height: 1.6; color: #3d4e87;">${roleLine}</p>` : ''}
            <p style="margin: 28px 0;">
              <a href="${inviteLink}" style="background: #1a2b6d; color: #fff; font-weight: 600; padding: 14px 28px; border-radius: 8px; text-decoration: none; display: inline-block;">Accept invite</a>
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #6878a8;">
              Or copy this link into your browser:<br>
              <a href="${inviteLink}" style="color: #1a4fd6;">${inviteLink}</a>
            </p>
            <p style="font-size: 14px; line-height: 1.6; color: #6878a8;">
              This link expires on ${new Date(invite.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
              If you weren't expecting this invite, you can safely ignore this email.
            </p>
            <p style="font-size: 14px; color: #6878a8; margin-top: 32px;">
              Daily View · <a href="${SITE_URL}/legal/privacy-policy.html" style="color: #6878a8;">Privacy Policy</a>
            </p>
          </div>
        `,
      }),
    });

    const resendBody = await res.json().catch(() => null);
    if (!res.ok) {
      return jsonResponse({ error: resendBody || 'send failed' }, 500);
    }

    // resendBody.id is Resend's own message id — harmless to return, and the
    // only way to trace a specific send in Resend's dashboard/logs without
    // separate log access.
    return jsonResponse({ ok: true, resendId: resendBody?.id || null });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
