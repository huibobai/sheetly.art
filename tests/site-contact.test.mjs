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

const DECIDED_INBOX = "contact@sheetly.art";
const STILL_PENDING = ["companyLegalName", "operatingName", "postalAddress", "phone"];

test("placeholder detector reports only the fields that are still placeholders", () => {
  assert.equal(CONTACT_PLACEHOLDERS_PENDING, true);
  const report = contactPlaceholderReport();
  assert.deepEqual(
    report.map((row) => row.field).sort(),
    [...STILL_PENDING].sort(),
  );
  assert.deepEqual(
    [...CONTACT_PLACEHOLDER_FIELDS].sort(),
    report.map((row) => row.field).sort(),
  );
  for (const row of report) {
    assert.equal(row.value, SITE_CONTACT[row.field]);
    assert.equal(row.value.includes(PLACEHOLDER_MARK), true);
  }
  assert.equal(SITE_CONTACT.takedownEmail.includes(PLACEHOLDER_MARK), false);
  assert.equal(SITE_CONTACT.supportEmail.includes(PLACEHOLDER_MARK), false);

  const filledPhone = contactPlaceholderReport({ ...SITE_CONTACT, phone: "+852 5555 0100" });
  assert.equal(
    filledPhone.some((row) => row.field === "phone"),
    false,
  );
  assert.equal(filledPhone.length, report.length - 1);
});

test("takedown and support both use the decided inbox", () => {
  assert.equal(SITE_CONTACT.takedownEmail, DECIDED_INBOX);
  assert.equal(SITE_CONTACT.supportEmail, DECIDED_INBOX);
  assert.equal(contactMailtoAddress(SITE_CONTACT.takedownEmail), DECIDED_INBOX);
  assert.equal(contactMailtoAddress(SITE_CONTACT.supportEmail), DECIDED_INBOX);
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
      if (text.includes(PLACEHOLDER_MARK) || text.includes(DECIDED_INBOX) || text.includes("BrainStock")) {
        hits.push(path.slice(root.length).replaceAll("\\", "/").replace(/^\//, ""));
      }
    }
  }
  walk(root);
  assert.deepEqual(hits, ["lib/site-contact.ts"]);
});

test("the retired legal mailbox does not appear in the repo", () => {
  const retired = ["legal", "@sheetly.art"].join("");
  const hits = [];
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === ".git") {
        continue;
      }
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js|md|sql|json|css)$/.test(name)) {
        continue;
      }
      const text = readFileSync(path, "utf8");
      if (text.includes(retired)) {
        hits.push(path.slice(root.length).replaceAll("\\", "/").replace(/^\//, ""));
      }
    }
  }
  walk(root);
  assert.deepEqual(hits, []);
});
