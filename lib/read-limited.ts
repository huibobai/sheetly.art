export class BodyTooLargeError extends Error {
  constructor() {
    super("Body exceeds the size limit.");
    this.name = "BodyTooLargeError";
  }
}

/**
 * Read a response body but stop (and cancel the stream) as soon as it passes `maxBytes`,
 * so an oversized upstream image never sits fully in memory.
 */
export async function readBodyWithLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  declaredLength?: string | null,
): Promise<Uint8Array> {
  if (declaredLength && Number(declaredLength) > maxBytes) {
    await body?.cancel().catch(() => undefined);
    throw new BodyTooLargeError();
  }
  if (!body) {
    return new Uint8Array(0);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
