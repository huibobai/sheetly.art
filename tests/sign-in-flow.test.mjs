import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyGoogleLinkError,
  emailBelongsToAnotherAccount,
  mapAuthError,
} from "../lib/auth-errors.ts";
import {
  canResend,
  initialDialogState,
  isCompleteOtp,
  otpDigits,
  reduceDialog,
  RESEND_COOLDOWN_MS,
  resendWaitMs,
  shouldStartDownload,
} from "../lib/sign-in-flow.ts";

test("dialog steps run choose, email, code, verified, and only then download", () => {
  let state = reduceDialog(initialDialogState(), { type: "open", purpose: "download" });
  assert.equal(state.step, "choose");
  assert.equal(shouldStartDownload({ step: state.step, purpose: state.purpose, isAnonymous: false }), false);

  state = reduceDialog(state, { type: "choose-email" });
  assert.equal(state.step, "email");
  state = reduceDialog(state, { type: "edit-email", email: "ada@example.com" });
  state = reduceDialog(state, { type: "code-sent", email: "ada@example.com", otpMode: "email_change", now: 1_000 });
  assert.equal(state.step, "code");
  assert.equal(state.otpMode, "email_change");
  assert.equal(shouldStartDownload({ step: state.step, purpose: state.purpose, isAnonymous: false }), false);

  state = reduceDialog(state, { type: "verified" });
  assert.equal(state.step, "verified");
  assert.equal(shouldStartDownload({ step: state.step, purpose: state.purpose, isAnonymous: false }), true);
});

test("download stays blocked while the session is anonymous or the step is unfinished", () => {
  assert.equal(shouldStartDownload({ step: "verified", purpose: "download", isAnonymous: true }), false);
  assert.equal(shouldStartDownload({ step: "verified", purpose: "download", isAnonymous: undefined }), false);
  assert.equal(shouldStartDownload({ step: "code", purpose: "download", isAnonymous: false }), false);
  assert.equal(shouldStartDownload({ step: "verified", purpose: "header", isAnonymous: false }), false);
  assert.equal(shouldStartDownload({ step: "choose", purpose: "download", isAnonymous: false }), false);
});

test("verified is ignored unless the code step was reached", () => {
  const opened = reduceDialog(initialDialogState(), { type: "open", purpose: "download" });
  assert.equal(reduceDialog(opened, { type: "verified" }).step, "choose");
});

test("back walks from code to email to choose", () => {
  let state = reduceDialog(initialDialogState(), { type: "open", purpose: "save" });
  state = reduceDialog(state, { type: "choose-email" });
  state = reduceDialog(state, { type: "code-sent", email: "a@b.co", otpMode: "email", now: 50 });
  state = reduceDialog(state, { type: "verify-failed", error: "That code doesn't match. Check the email and try again." });
  assert.equal(state.error?.includes("doesn't match"), true);
  state = reduceDialog(state, { type: "back" });
  assert.equal(state.step, "email");
  assert.equal(state.error, null);
  state = reduceDialog(state, { type: "back" });
  assert.equal(state.step, "choose");
});

test("resend waits out the cooldown and then allows another code", () => {
  const sentAt = 10_000;
  assert.equal(RESEND_COOLDOWN_MS, 45_000);
  assert.equal(canResend(sentAt, sentAt + 44_000), false);
  assert.equal(resendWaitMs(sentAt, sentAt + 20_000), 25_000);
  assert.equal(canResend(sentAt, sentAt + 45_000), true);
  assert.equal(resendWaitMs(null, 0), 0);

  let state = reduceDialog(initialDialogState(), { type: "open", purpose: "download" });
  state = reduceDialog(state, { type: "choose-email" });
  state = reduceDialog(state, { type: "code-sent", email: "a@b.co", otpMode: "email", now: sentAt });
  state = reduceDialog(state, { type: "code-sent", email: "a@b.co", otpMode: "email", now: sentAt + 45_000 });
  assert.equal(state.step, "code");
  assert.equal(state.sentAt, sentAt + 45_000);
});

test("otp field keeps digits and a pasted code", () => {
  assert.equal(otpDigits("12 34-56"), "123456");
  assert.equal(otpDigits("code 1234567 extra"), "123456");
  assert.equal(otpDigits(""), "");
  assert.equal(isCompleteOtp("123456"), true);
  assert.equal(isCompleteOtp("12345"), false);
  assert.equal(isCompleteOtp("12345a"), false);
});

test("email already registered, bad codes, and rate limits get friendly text", () => {
  assert.equal(emailBelongsToAnotherAccount({ code: "email_exists", message: "nope" }), true);
  assert.equal(emailBelongsToAnotherAccount({ message: "A user with this email address has already been registered" }), true);
  assert.equal(emailBelongsToAnotherAccount({ message: "Database timeout" }), false);

  assert.match(mapAuthError({ status: 429, message: "too many" }), /emails/i);
  assert.match(mapAuthError({ code: "over_email_send_rate_limit", message: "you can only request this after 20 seconds" }), /wait/i);
  assert.match(mapAuthError({ message: "Token has expired or is invalid" }), /wrong or has expired/i);
  assert.match(mapAuthError({ message: "Token has expired" }), /expired/i);
  assert.match(mapAuthError({ code: "otp_expired", message: "otp invalid" }), /wrong or has expired|doesn't match/i);
  assert.equal(classifyGoogleLinkError({ code: "manual_linking_disabled" }), "linking-off");
  assert.equal(classifyGoogleLinkError({ message: "Identity is already linked to another user" }), "google-taken");
  assert.equal(classifyGoogleLinkError({ message: "network down" }), null);
});
