/**
 * Pure state machine for the sign-in dialog.
 * choose -> email -> code -> verified, and only then may a download start.
 * A download also requires a permanent session (`is_anonymous === false`).
 */

export const RESEND_COOLDOWN_MS = 45_000;

export type SignInPurpose = "download" | "save" | "limit" | "header";
export type DialogStep = "choose" | "email" | "code" | "verified";
export type OtpMode = "email" | "email_change";

export type DialogState = {
  step: DialogStep;
  purpose: SignInPurpose;
  email: string;
  otpMode: OtpMode;
  sentAt: number | null;
  error: string | null;
};

export type DialogEvent =
  | { type: "open"; purpose: SignInPurpose }
  | { type: "choose-email" }
  | { type: "edit-email"; email: string }
  | { type: "code-sent"; email: string; otpMode: OtpMode; now: number }
  | { type: "verify-failed"; error: string }
  | { type: "verified" }
  | { type: "fail"; error: string }
  | { type: "back" }
  | { type: "close" };

export function initialDialogState(): DialogState {
  return {
    step: "choose",
    purpose: "header",
    email: "",
    otpMode: "email",
    sentAt: null,
    error: null,
  };
}

export function reduceDialog(state: DialogState, event: DialogEvent): DialogState {
  switch (event.type) {
    case "open":
      return { ...initialDialogState(), purpose: event.purpose };
    case "close":
      return initialDialogState();
    case "choose-email":
      if (state.step !== "choose" && state.step !== "email") {
        return state;
      }
      return { ...state, step: "email", error: null };
    case "edit-email":
      return { ...state, email: event.email, error: null };
    case "code-sent":
      if (state.step !== "email" && state.step !== "code") {
        return state;
      }
      return {
        ...state,
        step: "code",
        email: event.email,
        otpMode: event.otpMode,
        sentAt: event.now,
        error: null,
      };
    case "verify-failed":
      if (state.step !== "code") {
        return state;
      }
      return { ...state, error: event.error };
    case "verified":
      if (state.step !== "code") {
        return state;
      }
      return { ...state, step: "verified", error: null };
    case "fail":
      return { ...state, error: event.error };
    case "back":
      if (state.step === "code") {
        return { ...state, step: "email", error: null };
      }
      if (state.step === "email") {
        return { ...state, step: "choose", error: null };
      }
      return state;
    default:
      return state;
  }
}

export function resendWaitMs(sentAt: number | null, now: number): number {
  if (sentAt === null || !Number.isFinite(sentAt) || !Number.isFinite(now)) {
    return 0;
  }
  return Math.max(0, sentAt + RESEND_COOLDOWN_MS - now);
}

export function canResend(sentAt: number | null, now: number): boolean {
  return resendWaitMs(sentAt, now) === 0;
}

/** Digits only, at most 6. Used for typing and for pasting a code. */
export function otpDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function isCompleteOtp(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/**
 * The dialog may ask the page to download only after the code step has
 * verified and the session is a permanent user. Anonymous sessions never pass.
 */
export function shouldStartDownload(input: {
  step: DialogStep;
  purpose: SignInPurpose;
  isAnonymous: boolean | undefined;
}): boolean {
  return input.purpose === "download" && input.step === "verified" && input.isAnonymous === false;
}
