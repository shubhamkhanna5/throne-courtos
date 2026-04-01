import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function onRequestPost({ request, env }: { request: Request, env: any }) {
  try {
    const { fileName, fileType, fileSize, purpose, tournamentId, playerId } = await request.json() as any;

    if (!fileName || !fileType) {
      return new Response("Missing fileName or fileType", { status: 400 });
    }

    if (purpose !== "avatar") {
      return new Response("Invalid purpose", { status: 400 });
    }

    if (!fileType.startsWith("image/")) {
      return new Response("Invalid file type", { status: 400 });
    }

    // 2MB limit
    const MAX_SIZE = 2 * 1024 * 1024;
    if (fileSize && fileSize > MAX_SIZE) {
      return new Response("File too large", { status: 400 });
    }

    const tId = tournamentId || 'pending';
    const pId = playerId || Date.now();
    const ext = fileName.split('.').pop() || 'png';
    const key = `avatars/${tId}/${pId}.${ext}`;

    const client = new S3Client({
      region: "auto",
      endpoint: env.CLOUDFLARE_R2_ENDPOINT,
      credentials: {
        accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID,
        secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      },
    });

    const command = new PutObjectCommand({
      Bucket: env.CLOUDFLARE_R2_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    });

    const url = await getSignedUrl(client, command, { expiresIn: 3600 });

    return new Response(
      JSON.stringify({
        uploadUrl: url,
        publicUrl: `${env.CLOUDFLARE_R2_PUBLIC_URL}/${key}`,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
