import { createClient } from '@supabase/supabase-js';

export async function onRequestPost({ request, env }: { request: Request, env: any }) {
  try {
    const { tournament, players, matches } = await request.json() as any;
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Create tournament
    const { data: tData, error: tError } = await supabase
      .from('tournaments')
      .insert([tournament])
      .select()
      .single();

    if (tError) throw tError;

    // 2. Create players
    const { error: pError } = await supabase
      .from('players')
      .insert(players.map((p: any) => ({ ...p, tournament_id: tData.id })));

    if (pError) throw pError;

    // 3. Create matches
    const { error: mError } = await supabase
      .from('matches')
      .insert(matches.map((m: any) => ({ ...m, tournament_id: tData.id })));

    if (mError) throw mError;

    return new Response(JSON.stringify({ success: true, id: tData.id }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
