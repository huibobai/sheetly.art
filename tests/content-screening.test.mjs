import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BLOCKLIST_MESSAGE, blockedTermIn, isRightsConfirmed, rejectionForGenerateBody } from "../lib/content-blocklist.ts";
import { NSFW_BLOCKED_MESSAGE, outputHasNsfwConcepts } from "../lib/generate-screening.ts";
import { LEGAL_LAST_UPDATED, readRightsConfirmed, reportContentHref, takedownMailto, writeRightsConfirmed } from "../lib/legal.ts";
import { TAKEDOWN_EMAIL, contactMailtoAddress } from "../lib/site-contact.ts";
import { STICKER_STYLES, STYLE_PROMPTS } from "../lib/sticker-styles.ts";

test("legal page date stays on the published notice", () => {
  assert.equal(LEGAL_LAST_UPDATED, "11 November 2026");
});

test("blocklist matches brands, accents, and punctuation, and skips ordinary words", () => {
  assert.equal(blockedTermIn("Marvel"), "marvel");
  assert.equal(blockedTermIn("DiSnEy!!!"), "disney");
  assert.equal(blockedTermIn("LEGO"), "lego");
  assert.equal(blockedTermIn("Pokémon!"), "pokemon");
  assert.equal(blockedTermIn("Beyoncé"), "beyonce");
  assert.equal(blockedTermIn("Mário"), "mario");
  assert.equal(blockedTermIn("Coca-Cola"), "coca cola");
  assert.equal(blockedTermIn("cocacola"), "cocacola");
  assert.equal(blockedTermIn("starwars"), "starwars");
  assert.equal(blockedTermIn("Nike's logo"), "nike");
  assert.equal(blockedTermIn("a dc comic"), "dc");
  assert.equal(blockedTermIn("the simpsons"), "simpsons");
  assert.equal(blockedTermIn("The Weeknd"), "the weeknd");

  // Whole words only. These look similar and must not match.
  assert.equal(blockedTermIn("marvelous"), null);
  assert.equal(blockedTermIn("a marvelous dog"), null);
  assert.equal(blockedTermIn("marvellous"), null);
  assert.equal(blockedTermIn("marion"), null);
  assert.equal(blockedTermIn("marionette"), null);
  assert.equal(blockedTermIn("documentary"), null);
  assert.equal(blockedTermIn("adc"), null);
  assert.equal(blockedTermIn("supersonic"), null);
  assert.equal(blockedTermIn("weekend plans"), null);
  assert.equal(blockedTermIn("simpson"), null);
  assert.equal(blockedTermIn("harry.jpg"), null);
  assert.equal(blockedTermIn("my-marvelous-cat.jpg"), null);
  assert.equal(blockedTermIn("Please draw my dog in the garden"), null);
  assert.equal(blockedTermIn(""), null);
});

test("every shipped style prompt passes the blocklist and keeps likeness", () => {
  for (const style of STICKER_STYLES) {
    assert.equal(blockedTermIn(style), null, style);
    assert.equal(blockedTermIn(STYLE_PROMPTS[style]), null, `${style}: ${blockedTermIn(STYLE_PROMPTS[style])}`);
    assert.match(STYLE_PROMPTS[style], /Keep the same subject, pose, and recognizable features\./);
  }
});

test("rights confirmation is only boolean true", () => {
  assert.equal(isRightsConfirmed(true), true);
  for (const value of [false, "true", 1, 0, null, undefined, "yes", {}]) {
    assert.equal(isRightsConfirmed(value), false);
  }

  const memory = new Map();
  const storage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  assert.equal(readRightsConfirmed(storage), false);
  writeRightsConfirmed(storage, true);
  assert.equal(readRightsConfirmed(storage), true);
  writeRightsConfirmed(storage, false);
  assert.equal(readRightsConfirmed(storage), false);
});

test("generate body rejects a missing rights flag before a blocked name", () => {
  assert.deepEqual(rejectionForGenerateBody({}), {
    status: 400,
    error: "Please confirm you can use this photo (and that anyone in it is OK with it) before we style it.",
  });
  assert.equal(rejectionForGenerateBody({ rightsConfirmed: "true", style: "disney" })?.error, rejectionForGenerateBody({})?.error);
  assert.equal(
    rejectionForGenerateBody({ rightsConfirmed: true, style: "disney" })?.error,
    BLOCKLIST_MESSAGE,
  );
  assert.equal(
    rejectionForGenerateBody({ rightsConfirmed: true, style: "cartoon", fileName: "Mickey-Mouse.PNG" })?.error,
    BLOCKLIST_MESSAGE,
  );
  assert.equal(
    rejectionForGenerateBody({ rightsConfirmed: true, style: "cartoon", filename: "my-marvelous-cat.jpg" }),
    null,
  );
  assert.equal(
    rejectionForGenerateBody({
      rightsConfirmed: true,
      style: "cartoon",
      imageUrl: "https://cdn.example/disney-mickey.png",
    }),
    null,
  );
  assert.equal(
    rejectionForGenerateBody({ rightsConfirmed: true, style: "cartoon", caption: "a marvelous dog" }),
    null,
  );
  assert.equal(
    rejectionForGenerateBody({ rightsConfirmed: true, style: "cartoon", prompt: "make it look like Disney" })?.error,
    BLOCKLIST_MESSAGE,
  );
});

test("nsfw flags block only on boolean true", () => {
  assert.equal(NSFW_BLOCKED_MESSAGE, "This one didn't pass our safety check. Try a different photo.");
  assert.equal(BLOCKLIST_MESSAGE, "We can't make stickers of brands, characters or famous people. Try your own photo!");
  assert.equal(outputHasNsfwConcepts({ has_nsfw_concepts: [false], images: [{ url: "https://example.com/a.png" }] }), false);
  assert.equal(outputHasNsfwConcepts({ has_nsfw_concepts: [true] }), true);
  assert.equal(outputHasNsfwConcepts({ has_nsfw_concepts: [false, true] }), true);
  assert.equal(outputHasNsfwConcepts({ has_nsfw_concepts: [false], images: [{ has_nsfw_concepts: true }] }), true);
  assert.equal(outputHasNsfwConcepts({ images: [{ nsfw: true }] }), true);
  assert.equal(outputHasNsfwConcepts({}), false);
  assert.equal(outputHasNsfwConcepts(null), false);
  assert.equal(outputHasNsfwConcepts({ has_nsfw_concepts: ["true"] }), false);
  assert.equal(outputHasNsfwConcepts({ has_nsfw_concepts: [1] }), false);
});

test("report links keep a sheet id and drop anything else", () => {
  const id = "550e8400-e29b-41d4-a716-446655440000";
  assert.equal(reportContentHref(null), "/copyright");
  assert.equal(reportContentHref("restored"), "/copyright");
  assert.equal(reportContentHref("marvel"), "/copyright");
  assert.equal(reportContentHref(id.toUpperCase()), `/copyright?sheet=${id}`);
  const mail = takedownMailto(id);
  assert.equal(mail.startsWith(`mailto:${contactMailtoAddress(TAKEDOWN_EMAIL)}?`), true);
  const decoded = decodeURIComponent(mail.replaceAll("+", " "));
  assert.equal(decoded.includes(`Sheet id: ${id}`), true);
  assert.equal(decodeURIComponent(takedownMailto(null).replaceAll("+", " ")).includes("Sheet id:"), true);
});

test("generate route keeps the model, counts a safety block, and does not loosen safety", () => {
  const source = readFileSync(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(source, /fal-ai\/flux-pro\/kontext/);
  assert.equal(source.includes("safety_tolerance"), false);
  assert.match(source, /safety block still counts/);
  assert.match(source, /outputHasNsfwConcepts/);
  assert.match(source, /rejectionForGenerateBody/);
});
