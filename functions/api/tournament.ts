import { createClient } from '@supabase/supabase-js';

export async function onRequestGet({ env }: { env: any }) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Get current tournament
    const { data: tournaments, error: tError } = await supabase
      .from('tournaments')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);

    if (tError) throw tError;

    if (!tournaments || tournaments.length === 0) {
      return new Response(JSON.stringify(null), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const tId = tournaments[0].id;

    // 2. Fetch full state
    const [
      { data: tournament, error: tInfoError },
      { data: players, error: pError },
      { data: matches, error: mError }
    ] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', tId).single(),
      supabase.from('players').select('*').eq('tournament_id', tId),
      supabase.from('matches').select('*').eq('tournament_id', tId).order('round', { ascending: true })
    ]);

    if (tInfoError || pError || mError) throw tInfoError || pError || mError;

    return new Response(JSON.stringify({ tournament, players, matches }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
