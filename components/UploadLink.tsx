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
      className="btn btn-primary"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" d="M6 8.5 9.2 4.8a2 2 0 0 1 3.1 0L14 8.5" />
        <path strokeLinecap="round" d="M8.2 7.2v6.2" />
        <path strokeLinecap="round" d="M15.2 9.2v7.1" />
        <path strokeLinecap="round" d="M5 14.5c.4 3 2.2 4.7 5.2 4.7 2.4 0 4-.9 5.1-2.4" />
      </svg>
      Add a photo
    </button>
  );
}
