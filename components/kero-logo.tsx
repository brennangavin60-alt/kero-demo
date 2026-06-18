import Image from "next/image";
import { cn } from "@/lib/utils";

export function KeroLogo({
  className,
  imageClassName,
  alt = "Kero"
}: {
  className?: string;
  imageClassName?: string;
  alt?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white shadow-soft",
        className
      )}
    >
      <Image
        src="/kero-logo.png"
        width={748}
        height={776}
        alt={alt}
        priority
        className={cn("h-3/4 w-3/4 object-contain", imageClassName)}
      />
    </span>
  );
}
