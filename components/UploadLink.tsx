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
      className="inline-flex w-full cursor-pointer items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 sm:w-auto"
    >
      Upload a photo
    </button>
  );
}
