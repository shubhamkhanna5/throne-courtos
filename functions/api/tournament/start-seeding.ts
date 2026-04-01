import { createClient } from '@supabase/supabase-js';

export async function onRequestPost({ request, env }: { request: Request, env: any }) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get latest tournament
    const { data: tournaments, error: tError } = await supabase
      .from('tournaments')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);

    if (tError) throw tError;
    if (!tournaments || tournaments.length === 0) throw new Error('No tournament found');

    const tId = tournaments[0].id;

    // 2. Update status to ACTIVE
    const { error } = await supabase
      .from('tournaments')
      .update({ status: 'ACTIVE' })
      .eq('id', tId);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
