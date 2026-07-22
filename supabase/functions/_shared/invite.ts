import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

// Shared between accept-invite and send-invite-email: both need to
// independently re-verify a dv_account_invite row (existence, token match,
// expiry/revoked/accepted state) using the service role, since an invitee —
// and even the inviter, for the purposes of these functions — has no
// RLS-readable access to it directly.

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const SITE_URL = 'https://www.dailyview.org';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface InviteRow {
  invite_id: string;
  account_id: number;
  email: string;
  role_id: number;
  permission_id: number;
  relationship_to_viewer: string | null;
  can_manage_events: boolean;
  can_manage_users: boolean;
  can_manage_devices: boolean;
  can_send_prompts: boolean;
  is_primary_contact: boolean;
  token_hash: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  dv_account: { account_name: string } | null;
  dv_account_user_role: { role: string } | null;
  dv_user: { full_name: string } | null;
}

export async function loadInvite(inviteId: string): Promise<InviteRow | null> {
  const { data, error } = await admin
    .from('dv_account_invite')
    .select(
      'invite_id, account_id, email, role_id, permission_id, relationship_to_viewer, ' +
        'can_manage_events, can_manage_users, can_manage_devices, can_send_prompts, is_primary_contact, ' +
        'token_hash, expires_at, accepted_at, revoked_at, ' +
        // dv_account_invite has exactly one FK to dv_user (created_by_user_id),
        // so this embed — unlike dv_account_user's — is unambiguous as-is.
        'dv_account(account_name), dv_account_user_role(role), dv_user(full_name)'
    )
    .eq('invite_id', inviteId)
    .maybeSingle();
  if (error) throw error;
  return data as InviteRow | null;
}

export type CheckInviteResult =
  | { ok: true; invite: InviteRow }
  | { ok: false; reason: 'invalid' | 'revoked' | 'accepted' | 'expired' };

// invite_id + token together prove knowledge of the one-time secret; a
// mismatch on either is reported identically as 'invalid' so a guessed
// invite_id can't be used to fish for whether an invite exists.
export async function checkInvite(
  inviteId: string | undefined,
  token: string | undefined
): Promise<CheckInviteResult> {
  if (!inviteId || !token) return { ok: false, reason: 'invalid' };

  const invite = await loadInvite(inviteId);
  if (!invite) return { ok: false, reason: 'invalid' };

  const tokenHash = await sha256Hex(token);
  if (tokenHash !== invite.token_hash) return { ok: false, reason: 'invalid' };
  if (invite.revoked_at) return { ok: false, reason: 'revoked' };
  if (invite.accepted_at) return { ok: false, reason: 'accepted' };
  if (new Date(invite.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  return { ok: true, invite };
}
