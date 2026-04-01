export async function onRequestPost({ request, env }: { request: Request, env: any }) {
  try {
    const { token } = await request.json() as { token: string };

    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'Missing token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: env.CLOUDFLARE_TURNSTILE_SECRET_KEY,
          response: token,
        }),
      }
    );

    const data = await res.json();

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
