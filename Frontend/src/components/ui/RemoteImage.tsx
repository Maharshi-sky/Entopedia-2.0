"use client";

import { useState, type ReactNode } from "react";
import { ImageIcon } from "lucide-react";

// A picture that next/image cannot optimise: one from another site, or one
// served by an API route that needs the signed-in user's cookie (news
// pictures, /api/news-image/...). A plain lazy <img>; if it fails to load,
// `fallback` (or a placeholder icon) shows instead of a broken image.
export function RemoteImage({ src, alt, fallback }: { src: string; alt: string; fallback?: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      fallback ?? (
        <div className="absolute inset-0 grid place-items-center bg-gray-200 text-gray-400">
          <ImageIcon className="size-6" strokeWidth={1.5} />
        </div>
      )
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see above
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="absolute inset-0 size-full object-cover"
    />
  );
}
