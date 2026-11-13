import Image from "next/image";
import { Card } from "@/components/ui/Card";

// Shown by the result steps when the loaded sheet has nothing they can use.
export function EmptyStep({
  title,
  description,
  message,
}: {
  title: string;
  description: string;
  message: string;
}) {
  return (
    <>
      <section>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-xs text-gray-600">{description}</p>
      </section>

      <Card className="py-4">
        <p className="text-xs text-gray-600">{message}</p>
      </Card>

      {/* Negative margin offsets the transparent space above the drawing. */}
      <div className="-mt-16 flex justify-center pb-6">
        <div className="relative w-full max-w-lg">
          {/* Sits just under the drawing's base (the PNG has transparent padding below it). */}
          <div
            aria-hidden
            className="float-shadow absolute inset-x-0 top-[73%] mx-auto h-8 w-[68%] rounded-[50%] bg-[radial-gradient(closest-side,rgba(0,71,54,0.55),transparent)] blur-sm"
          />
          <Image
            src="/error.png"
            alt=""
            width={1254}
            height={1254}
            sizes="(min-width: 768px) 32rem, 90vw"
            className="float relative h-auto w-full"
          />
        </div>
      </div>
    </>
  );
}
