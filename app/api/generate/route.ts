import { fal } from "@fal-ai/client";
import { connection } from "next/server";
import { isStickerStyle, STYLE_PROMPTS } from "@/lib/sticker-styles";

export const maxDuration = 60;

type GenerateBody = {
  imageUrl?: unknown;
  style?: unknown;
};

function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  await connection();

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return Response.json({ error: "Send an image URL and a style." }, { status: 400 });
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const style = typeof body.style === "string" ? body.style : "";

  if (!isHttpsUrl(imageUrl) || !isStickerStyle(style)) {
    return Response.json(
      { error: "Choose an uploaded photo and a sticker style." },
      { status: 400 },
    );
  }

  const falKey = process.env.FAL_KEY;
  if (!falKey) {
    return Response.json(
      { error: "Set FAL_KEY before generating." },
      { status: 500 },
    );
  }

  fal.config({ credentials: falKey });

  try {
    const result = await fal.subscribe("fal-ai/flux-pro/kontext", {
      input: {
        prompt: STYLE_PROMPTS[style],
        image_url: imageUrl,
        num_images: 1,
        output_format: "png",
        enhance_prompt: false,
        guidance_scale: 4,
      },
    });

    const generatedUrl = result.data.images[0]?.url;
    if (!generatedUrl) {
      return Response.json(
        { error: "Could not generate a sticker. Please try again." },
        { status: 502 },
      );
    }

    return Response.json({ imageUrl: generatedUrl });
  } catch (error) {
    console.error("Fal generation failed", error);
    const detail =
      error && typeof error === "object" && "body" in error
        ? (error as { body?: { detail?: unknown } }).body?.detail
        : undefined;

    if (typeof detail === "string" && /exhausted balance/i.test(detail)) {
      return Response.json(
        { error: "Fal.ai balance is empty. Top up at fal.ai/dashboard/billing, then try again." },
        { status: 402 },
      );
    }

    return Response.json(
      { error: "Could not generate a sticker. Please try again." },
      { status: 502 },
    );
  }
}
