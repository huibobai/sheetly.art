import assert from "node:assert/strict";
import { test } from "node:test";
import { BRAND_ASSETS } from "../lib/brand-assets.ts";
import { STICKER_STYLES, STYLE_LABELS, STYLE_PROMPTS } from "../lib/sticker-styles.ts";

/**
 * Companies, franchises, consoles, studios, characters, and the style words
 * removed from labels and model prompts. Matched as whole words so
 * "marvelous" does not match "marvel". Style ids are not scanned: "anime"
 * stays the stored id for sheets and URLs.
 */
const BLOCKED_TERMS = [
  "anime",
  "16-bit",
  "8-bit",
  "32-bit",
  "nintendo",
  "sega",
  "playstation",
  "xbox",
  "game boy",
  "gameboy",
  "pokemon",
  "pikachu",
  "disney",
  "pixar",
  "marvel",
  "ghibli",
  "dreamworks",
  "nickelodeon",
  "sanrio",
  "hello kitty",
  "mario",
  "luigi",
  "sonic",
  "kirby",
  "zelda",
  "mickey",
  "naruto",
  "goku",
  "dragon ball",
  "star wars",
  "harry potter",
  "minecraft",
];

function fold(value) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function blockedTermIn(value) {
  const haystack = fold(value);
  for (const term of BLOCKED_TERMS) {
    const needle = fold(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?:^|[^a-z0-9])${needle}(?:[^a-z0-9]|$)`).test(haystack)) {
      return term;
    }
  }
  return null;
}

function walkAssets(value, trail, found) {
  if (value && typeof value === "object" && "path" in value && "width" in value && "height" in value) {
    found.push([trail, value]);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walkAssets(child, trail ? `${trail}.${key}` : key, found);
  }
}

test("style labels and model prompts avoid blocked names", () => {
  const copy = [
    ...Object.values(STYLE_LABELS),
    ...Object.values(STYLE_PROMPTS),
    ...Object.values(BRAND_ASSETS.stylePreviews).map((asset) => asset.alt),
  ];
  for (const text of copy) {
    assert.equal(blockedTermIn(text), null, text);
  }
});

test("the blocked-term check catches the old style wording", () => {
  assert.equal(blockedTermIn("Anime"), "anime");
  assert.equal(blockedTermIn("like a 16-bit game sprite"), "16-bit");
  assert.equal(blockedTermIn("Pokémon"), "pokemon");
  assert.equal(blockedTermIn("marvelous cartoon"), null);
});

test("renamed styles keep their stored ids", () => {
  assert.ok(STICKER_STYLES.includes("anime"));
  assert.ok(STICKER_STYLES.includes("pixel-art"));
  assert.equal(STYLE_LABELS.anime, "Big-eye cartoon");
  assert.match(STYLE_PROMPTS.anime, /bold cel-shaded illustration/);
  assert.equal(STYLE_LABELS["pixel-art"], "Retro pixel art");
  assert.match(STYLE_PROMPTS["pixel-art"], /chunky low-resolution pixel art/);
  assert.equal(Object.keys(BRAND_ASSETS.stylePreviews).sort().join(), [...STICKER_STYLES].sort().join());
});

test("every brand asset slot has provenance, alt, and a size", () => {
  const found = [];
  walkAssets(BRAND_ASSETS, "", found);
  assert.equal(found.length, 3 + STICKER_STYLES.length);
  for (const [name, asset] of found) {
    assert.equal(typeof asset.path, "string", name);
    assert.ok(asset.path.length > 0, name);
    assert.equal(typeof asset.alt, "string", name);
    assert.equal(typeof asset.width, "number", name);
    assert.equal(typeof asset.height, "number", name);
    assert.ok(asset.width > 0 && asset.height > 0, name);
    assert.equal(typeof asset.provenance, "string", name);
    assert.ok(asset.provenance.trim().length > 0, `${name} provenance`);
  }
});
