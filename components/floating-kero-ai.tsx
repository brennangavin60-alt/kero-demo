"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { usePathname } from "next/navigation";
import { KeroAiChat } from "@/components/ai-briefing";
import { KeroLogo } from "@/components/kero-logo";
import { Button } from "@/components/ui/button";
import { useKeroStore } from "@/lib/storage";

export function FloatingKeroAi() {
  const pathname = usePathname();
  const { state, hydrated } = useKeroStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/briefing")) setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function openPanel() {
      if (!pathname.startsWith("/briefing")) setOpen(true);
    }

    function closePanel() {
      setOpen(false);
    }

    window.addEventListener("kero:open-ai", openPanel);
    window.addEventListener("kero:close-overlays", closePanel);
    return () => {
      window.removeEventListener("kero:open-ai", openPanel);
      window.removeEventListener("kero:close-overlays", closePanel);
    };
  }, [pathname]);

  if (pathname.startsWith("/briefing")) {
    return null;
  }

  const showButton = !hydrated || state.settings.keroAi.floatingButtonEnabled;

  return (
    <>
      {open ? (
        <section
          className="kero-ai-panel fixed bottom-24 right-4 z-50 flex h-[min(74vh,46rem)] w-[calc(100vw-2rem)] max-w-[28rem] flex-col overflow-hidden rounded-lg border border-white/70 bg-white/95 shadow-[0_24px_70px_rgba(15,23,42,0.24)] backdrop-blur-xl md:right-6"
          aria-label="Kero AI quick chat"
        >
          <header className="flex items-start justify-between gap-3 border-b border-white/10 bg-[linear-gradient(180deg,hsl(var(--primary))_0%,hsl(222_54%_13%)_100%)] px-4 py-3 text-white">
            <div className="flex min-w-0 items-start gap-3">
              <KeroLogo className="h-9 w-9" imageClassName="h-[82%] w-[82%]" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold">Kero AI</h2>
                <p className="text-xs leading-5 text-white/75">
                  Ask questions or confirm changes without leaving this page.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-white hover:bg-white/10"
              aria-label="Close Kero AI"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </header>
          <div className="min-h-0 flex-1 p-3">
            <KeroAiChat variant="panel" />
          </div>
        </section>
      ) : null}

      {showButton ? (
        <Button
          type="button"
          size="icon"
          className="kero-ai-pulse fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full border border-white/30 bg-primary text-white shadow-[0_16px_34px_rgba(15,23,42,0.28)] ring-1 ring-primary/15 hover:bg-primary/95 md:bottom-6 md:right-6"
          aria-label="Open Kero AI"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <KeroLogo className="h-9 w-9 rounded-full shadow-none" imageClassName="h-[82%] w-[82%]" />
        </Button>
      ) : null}
    </>
  );
}
