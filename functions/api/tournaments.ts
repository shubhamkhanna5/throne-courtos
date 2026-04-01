import { createClient } from '@supabase/supabase-js';

export async function onRequestGet({ env }: { env: any }) {
  try {
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) throw error;

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
