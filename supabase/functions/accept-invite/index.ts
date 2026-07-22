import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

// Redeems a dv_account_invite row (created by the dashboard's "Invite
// person" flow — see dashboard/people.js) into a real dv_user +
// dv_account_user membership.
//
// dv_account_invite has no anon-readable RLS policy (only existing account
// managers can read it) and the invitee has no dv_user/dv_account_user of
// their own yet, so this cannot be done from the browser under RLS. This
// function runs with the service-role key instead, and independently
// re-derives every fact it trusts (invite validity, token match, caller
// identity for the existing-user path) rather than accepting client claims.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface InviteRow {
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
}

async function loadInvite(inviteId: string): Promise<InviteRow | null> {
  const { data, error } = await admin
    .from('dv_account_invite')
    .select(
      'invite_id, account_id, email, role_id, permission_id, relationship_to_viewer, ' +
        'can_manage_events, can_manage_users, can_manage_devices, can_send_prompts, is_primary_contact, ' +
        'token_hash, expires_at, accepted_at, revoked_at, ' +
        'dv_account(account_name), dv_account_user_role(role)'
    )
    .eq('invite_id', inviteId)
    .maybeSingle();
  if (error) throw error;
  return data as InviteRow | null;
}

// invite_id + token together prove knowledge of the one-time secret; a
// mismatch on either is reported identically as 'invalid' so a guessed
// invite_id can't be used to fish for whether an invite exists.
async function checkInvite(inviteId: string | undefined, token: string | undefined) {
  if (!inviteId || !token) return { ok: false as const, reason: 'invalid' as const };

  const invite = await loadInvite(inviteId);
  if (!invite) return { ok: false as const, reason: 'invalid' as const };

  const tokenHash = await sha256Hex(token);
  if (tokenHash !== invite.token_hash) return { ok: false as const, reason: 'invalid' as const };
  if (invite.revoked_at) return { ok: false as const, reason: 'revoked' as const };
  if (invite.accepted_at) return { ok: false as const, reason: 'accepted' as const };
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return { ok: false as const, reason: 'expired' as const };
  }

  return { ok: true as const, invite };
}

// dv_user.email is not guaranteed unique (see login spec §4.1 — the
// authoritative identity is auth_user_id, not email), so this fetches all
// matches and prefers one already linked to an auth identity rather than
// assuming a single row.
async function findDvUserByEmail(email: string) {
  const { data, error } = await admin
    .from('dv_user')
    .select('user_id, auth_user_id')
    .ilike('email', email);
  if (error) throw error;
  const rows = (data || []) as { user_id: number; auth_user_id: string | null }[];
  if (rows.length === 0) return null;
  return rows.find((r) => r.auth_user_id) || rows[0];
}

// Live seed values (confirmed against the linked project): viewer, updater,
// viewer_updater, admin, supporter. 'supporter' best matches who redeems an
// account invite — "a relative or friend supporting somebody at home" (login
// spec §2.2) — as distinct from 'viewer', which describes the person the
// display is for, not a dashboard collaborator.
async function pickDefaultUserTypeId(): Promise<number | null> {
  const { data, error } = await admin
    .from('dv_user_type')
    .select('user_type_id, user_type')
    .order('user_type_id', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return null;

  const preferredOrder = ['supporter', 'updater', 'admin'];
  for (const preferred of preferredOrder) {
    const match = data.find((t: { user_type: string }) => t.user_type === preferred);
    if (match) return match.user_type_id;
  }
  const nonViewer = data.find((t: { user_type: string }) => t.user_type !== 'viewer' && t.user_type !== 'viewer_updater');
  return (nonViewer || data[0]).user_type_id;
}

function membershipFields(invite: InviteRow, userId: number) {
  return {
    account_id: invite.account_id,
    user_id: userId,
    role_id: invite.role_id,
    permission_id: invite.permission_id,
    relationship_to_viewer: invite.relationship_to_viewer,
    can_manage_events: invite.can_manage_events,
    can_manage_users: invite.can_manage_users,
    can_manage_devices: invite.can_manage_devices,
    can_send_prompts: invite.can_send_prompts,
    is_primary_contact: invite.is_primary_contact,
  };
}

async function ensureMembershipAndMarkAccepted(invite: InviteRow, userId: number) {
  const { data: existingMembership, error: membershipLookupError } = await admin
    .from('dv_account_user')
    .select('account_id, user_id')
    .eq('account_id', invite.account_id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  if (membershipLookupError) throw membershipLookupError;

  if (!existingMembership) {
    const { error: insertError } = await admin
      .from('dv_account_user')
      .insert(membershipFields(invite, userId));
    if (insertError) throw insertError;
  }

  const { error: acceptError } = await admin
    .from('dv_account_invite')
    .update({ accepted_at: new Date().toISOString() })
    .eq('invite_id', invite.invite_id);
  if (acceptError) throw acceptError;
}

async function handleVerify(inviteId: string, token: string) {
  const result = await checkInvite(inviteId, token);
  if (!result.ok) return jsonResponse({ valid: false, reason: result.reason });

  const invite = result.invite;
  const existing = await findDvUserByEmail(invite.email);

  return jsonResponse({
    valid: true,
    email: invite.email,
    accountName: invite.dv_account?.account_name || null,
    role: invite.dv_account_user_role?.role || null,
    existingUser: !!(existing && existing.auth_user_id),
  });
}

async function handleAcceptExistingUser(invite: InviteRow, authHeader: string | null) {
  if (!authHeader) return jsonResponse({ error: 'sign-in-required' }, 401);

  const accessToken = authHeader.replace(/^Bearer\s+/i, '');
  const { data: authResult, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authResult?.user) return jsonResponse({ error: 'sign-in-required' }, 401);

  const authedUser = authResult.user;
  if ((authedUser.email || '').toLowerCase() !== invite.email.toLowerCase()) {
    return jsonResponse({ error: 'email-mismatch' }, 403);
  }

  const dvUser = await findDvUserByEmail(invite.email);
  if (!dvUser || dvUser.auth_user_id !== authedUser.id) {
    return jsonResponse({ error: 'account-mismatch' }, 403);
  }

  await ensureMembershipAndMarkAccepted(invite, dvUser.user_id);
  return jsonResponse({ ok: true });
}

async function handleAcceptNewUser(invite: InviteRow, fullName: string | undefined, password: string | undefined) {
  const trimmedName = (fullName || '').trim();
  if (!trimmedName) return jsonResponse({ error: 'full-name-required' }, 400);
  if (!password || password.length < 12) return jsonResponse({ error: 'weak-password' }, 400);

  // Re-check right before creating the auth identity — closes the race where
  // two invite links for the same email are redeemed at once.
  const alreadyLinked = await findDvUserByEmail(invite.email);
  if (alreadyLinked && alreadyLinked.auth_user_id) {
    return jsonResponse({ error: 'account-exists' }, 409);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    const message = (createError?.message || '').toLowerCase();
    if (message.includes('already') || message.includes('registered')) {
      return jsonResponse({ error: 'account-exists' }, 409);
    }
    throw createError || new Error('auth user creation failed');
  }

  let userId: number;
  if (alreadyLinked) {
    // A dv_user placeholder existed (e.g. modelled before this person ever
    // logged in) but had no auth identity yet — link it rather than
    // duplicating the person record.
    const { error: updateError } = await admin
      .from('dv_user')
      .update({ full_name: trimmedName, auth_user_id: created.user.id, is_active: true })
      .eq('user_id', alreadyLinked.user_id);
    if (updateError) throw updateError;
    userId = alreadyLinked.user_id;
  } else {
    const userTypeId = await pickDefaultUserTypeId();
    const { data: newDvUser, error: insertError } = await admin
      .from('dv_user')
      .insert({
        full_name: trimmedName,
        email: invite.email,
        user_type_id: userTypeId,
        is_active: true,
        auth_user_id: created.user.id,
      })
      .select('user_id')
      .single();
    if (insertError) throw insertError;
    userId = newDvUser.user_id;
  }

  await ensureMembershipAndMarkAccepted(invite, userId);
  return jsonResponse({ ok: true });
}

async function handleAccept(body: Record<string, unknown>, authHeader: string | null) {
  const inviteId = body.invite_id as string | undefined;
  const token = body.token as string | undefined;
  const result = await checkInvite(inviteId, token);
  if (!result.ok) return jsonResponse({ error: result.reason }, 410);

  const invite = result.invite;
  const existing = await findDvUserByEmail(invite.email);

  if (existing && existing.auth_user_id) {
    return handleAcceptExistingUser(invite, authHeader);
  }
  return handleAcceptNewUser(invite, body.full_name as string | undefined, body.password as string | undefined);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === 'verify') {
      return await handleVerify(body.invite_id, body.token);
    }
    if (action === 'accept') {
      return await handleAccept(body, req.headers.get('Authorization'));
    }
    return jsonResponse({ error: 'unknown-action' }, 400);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
