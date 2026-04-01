import { createClient } from '@supabase/supabase-js';

export async function onRequestPost({ request, env }: { request: Request, env: any }) {
  try {
    const { id } = await request.json() as { id: string };
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', id);

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
