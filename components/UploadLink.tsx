"use client";

export const PHOTO_UPLOAD_INPUT_ID = "photo-upload";

export function UploadLink() {
  return (
    <button
      type="button"
      onClick={() => {
        document.getElementById("upload")?.scrollIntoView({ behavior: "smooth", block: "start" });
        const input = document.getElementById(PHOTO_UPLOAD_INPUT_ID);
        if (input instanceof HTMLInputElement && !input.disabled) {
          input.click();
        }
      }}
      className="inline-flex w-full cursor-pointer items-center justify-center rounded-full border-2 border-ink bg-accent px-7 py-3.5 text-base font-bold text-white shadow-[3px_3px_0_var(--foreground)] transition-transform hover:-translate-y-0.5 hover:bg-accent-strong sm:w-auto"
    >
      Add a photo ✂️
    </button>
  );
}
