export const NSFW_BLOCKED_MESSAGE = "This one didn't pass our safety check. Try a different photo.";

function flagIsTrue(value: unknown): boolean {
  if (value === true) {
    return true;
  }
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((item) => item === true);
}

/**
 * True when fal reports any output as NSFW.
 * Only a boolean true counts. A missing flag is not a block.
 * The string "true" and the number 1 are not a block.
 * The generate route consumes quota before this check, so a blocked result still counts.
 */
export function outputHasNsfwConcepts(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }
  const record = data as { has_nsfw_concepts?: unknown; images?: unknown };
  if (flagIsTrue(record.has_nsfw_concepts)) {
    return true;
  }
  if (!Array.isArray(record.images)) {
    return false;
  }
  for (const image of record.images) {
    if (!image || typeof image !== "object") {
      continue;
    }
    const candidate = image as { has_nsfw_concepts?: unknown; nsfw?: unknown };
    if (candidate.nsfw === true || flagIsTrue(candidate.has_nsfw_concepts)) {
      return true;
    }
  }
  return false;
}
