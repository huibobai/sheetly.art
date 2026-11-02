"use client";

export function UploadLink() {
  return (
    <a
      href="#upload"
      onClick={(event) => {
        const target = document.getElementById("upload");
        if (!target) {
          return;
        }
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.focus({ preventScroll: true });
        history.pushState(null, "", "#upload");
      }}
      className="inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 sm:w-auto"
    >
      Upload a photo
    </a>
  );
}
