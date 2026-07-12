// Deployed with: supabase functions deploy pin-signin --no-verify-jwt
//
// Lets a staff member sign in with just email + PIN, on any device, without a
// prior password sign-in on that device. The PIN itself is never trusted from
// the client alone — verify_staff_pin (run with the service role, bypassing
// RLS) checks a securely-hashed PIN and enforces attempt lockout. Only after
// that succeeds does this function mint a real Supabase session and hand the
// tokens back to the client.
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

  let email: unknown;
  let pin: unknown;
  try {
    const body = await req.json();
    email = body.email;
    pin = body.pin;
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  if (typeof email !== 'string' || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return json({ error: 'Invalid email or PIN' }, 400);
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: staffId, error: verifyError } = await supabaseAdmin.rpc('verify_staff_pin', {
    p_email: email,
    p_pin: pin,
  });

  if (verifyError) {
    console.error('verify_staff_pin failed', verifyError);
    return json({ error: 'Something went wrong' }, 500);
  }
  if (!staffId) {
    // Deliberately generic — doesn't reveal whether the email exists, whether
    // a PIN is set up, or whether the account is locked out.
    return json({ error: 'Invalid email or PIN' }, 401);
  }

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email,
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
