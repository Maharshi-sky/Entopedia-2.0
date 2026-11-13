import Image from "next/image";
import { ImageIcon } from "lucide-react";

// Fills its (relatively positioned) parent; shows a placeholder until a src is set.
export function Thumbnail({
  src,
  alt,
  sizes,
}: {
  src?: string;
  alt: string;
  sizes: string;
}) {
  if (!src) {
    return (
      <div className="grid size-full place-items-center bg-gray-200 text-gray-400">
        <ImageIcon className="size-6" strokeWidth={1.5} />
      </div>
    );
  }
  return <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" />;
}
