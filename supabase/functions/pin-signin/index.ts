// Deployed with: supabase functions deploy pin-signin --no-verify-jwt
//
// Lets a staff member sign in with just a name (picked from a list) + PIN, on
// any device, without a prior password sign-in on that device. The PIN itself
// is never trusted from the client alone — verify_staff_pin (run with the
// service role, bypassing RLS) checks a securely-hashed PIN and enforces
// attempt lockout. Only after that succeeds does this function look up the
// account's email (never exposed to the client) and mint a real session.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let staffId: unknown;
  let pin: unknown;
  try {
    const body = await req.json();
    staffId = body.staffId;
    pin = body.pin;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  if (typeof staffId !== 'string' || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return json({ error: 'Invalid request' }, 400);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: verified, error: verifyError } = await supabaseAdmin.rpc('verify_staff_pin', {
    p_staff_id: staffId,
    p_pin: pin,
  });

  if (verifyError) {
    console.error('verify_staff_pin failed', verifyError);
    return json({ error: 'Something went wrong' }, 500);
  }
  if (!verified) {
    // Deliberately generic — doesn't reveal whether a PIN is set up or
    // whether the account is locked out.
    return json({ error: 'Incorrect PIN' }, 401);
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(staffId);
  if (userError || !userData.user?.email) {
    console.error('getUserById failed', userError);
    return json({ error: 'Something went wrong' }, 500);
  }

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.user.email,
  });
  if (linkError || !linkData) {
    console.error('generateLink failed', linkError);
    return json({ error: 'Something went wrong' }, 500);
  }

  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (sessionError || !sessionData.session) {
    console.error('verifyOtp failed', sessionError);
    return json({ error: 'Something went wrong' }, 500);
  }

  return json(
    {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
    },
    200,
  );
});
