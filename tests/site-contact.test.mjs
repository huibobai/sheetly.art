import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { emailFooterHtml, emailFooterText } from "../lib/email/footer.ts";
import {
  CONTACT_PLACEHOLDER_FIELDS,
  CONTACT_PLACEHOLDERS_PENDING,
  PLACEHOLDER_MARK,
  SITE_CONTACT,
  contactMailtoAddress,
  contactPlaceholderReport,
} from "../lib/site-contact.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

test("placeholder detector reports every contact field that is still a placeholder", () => {
  assert.equal(CONTACT_PLACEHOLDERS_PENDING, true);
  const report = contactPlaceholderReport();
  assert.deepEqual(
    report.map((row) => row.field).sort(),
    Object.keys(SITE_CONTACT).sort(),
  );
  assert.deepEqual(
    [...CONTACT_PLACEHOLDER_FIELDS].sort(),
    report.map((row) => row.field).sort(),
  );
  for (const row of report) {
    assert.equal(row.value, SITE_CONTACT[row.field]);
    assert.equal(row.value.includes(PLACEHOLDER_MARK), true);
  }

  const filledPhone = contactPlaceholderReport({ ...SITE_CONTACT, phone: "+852 5555 0100" });
  assert.equal(
    filledPhone.some((row) => row.field === "phone"),
    false,
  );
  assert.equal(filledPhone.length, report.length - 1);
});

test("takedown mailbox can be linked, and the support placeholder cannot", () => {
  assert.equal(contactMailtoAddress(SITE_CONTACT.takedownEmail), "legal@sheetly.art");
  assert.equal(contactMailtoAddress(SITE_CONTACT.supportEmail), null);
});

test("email footer includes every contact field and the legal links", () => {
  const origin = "https://sheetly.art";
  const html = emailFooterHtml(origin);
  const text = emailFooterText(origin);
  for (const value of Object.values(SITE_CONTACT)) {
    assert.equal(/[&<>"]/.test(value), false, value);
    assert.equal(html.includes(value), true, value);
    assert.equal(text.includes(value), true, value);
  }
  for (const path of ["/terms", "/privacy", "/contact"]) {
    const href = `${origin}${path}`;
    assert.equal(html.includes(`href="${href}"`), true, href);
    assert.equal(text.includes(href), true, href);
  }
});

test("contact strings live only in lib/site-contact.ts", () => {
  const hits = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === ".git" || name === "tests") {
        continue;
      }
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js|md|sql|json)$/.test(name)) {
        continue;
      }
      const text = readFileSync(path, "utf8");
      if (text.includes(PLACEHOLDER_MARK) || text.includes("legal@sheetly.art") || text.includes("BrainStock")) {
        hits.push(path.slice(root.length).replaceAll("\\", "/").replace(/^\//, ""));
      }
    }
  }
  walk(root);
  assert.deepEqual(hits, ["lib/site-contact.ts"]);
});
