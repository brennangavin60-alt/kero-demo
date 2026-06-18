"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Keyboard, X } from "lucide-react";
import { useToast } from "@/components/toast-provider";
import { Button } from "@/components/ui/button";
import { navigateWithSoftTransition } from "@/lib/navigation-transition";

const HINT_STORAGE_KEY = "kero-keyboard-shortcuts-hint-dismissed";
const OPEN_AI_EVENT = "kero:open-ai";
const CLOSE_OVERLAYS_EVENT = "kero:close-overlays";
const FOCUS_SEARCH_EVENT = "kero:focus-global-search";

type ShortcutRow = {
  keys: string;
  action: string;
};

export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [shortcutsEnabled, setShortcutsEnabled] = useState(false);
  const modifierLabel = "Ctrl";

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const syncShortcuts = () => {
      const enabled = mediaQuery.matches;
      setShortcutsEnabled(enabled);
      if (!enabled) {
        setHintVisible(false);
        setReferenceOpen(false);
      }
    };

    syncShortcuts();
    mediaQuery.addEventListener("change", syncShortcuts);
    return () => mediaQuery.removeEventListener("change", syncShortcuts);
  }, []);

  useEffect(() => {
    if (!shortcutsEnabled) return;
    setHintVisible(window.localStorage.getItem(HINT_STORAGE_KEY) !== "true");
  }, [shortcutsEnabled]);

  const shortcuts = useMemo<ShortcutRow[]>(
    () => [
      { keys: `${modifierLabel} + N`, action: "Open New Matter" },
      { keys: `${modifierLabel} + K`, action: "Open Kero AI quick panel" },
      { keys: `${modifierLabel} + D`, action: "Go to Dashboard" },
      { keys: `${modifierLabel} + M`, action: "Go to Matters" },
      { keys: `${modifierLabel} + C`, action: "Go to Clients" },
      { keys: `${modifierLabel} + Shift + D`, action: "Go to Documents" },
      { keys: `${modifierLabel} + Shift + C`, action: "Go to Calendar" },
      { keys: `${modifierLabel} + Shift + A`, action: "Go to Activity" },
      { keys: `${modifierLabel} + T`, action: "Go to Time & Billing" },
      { keys: `${modifierLabel} + R`, action: "Go to Resources" },
      { keys: `${modifierLabel} + /`, action: "Focus global search" },
      { keys: `${modifierLabel} + B`, action: "Go to My Firm" },
      { keys: `${modifierLabel} + ,`, action: "Go to Settings" },
      { keys: "Esc", action: "Close open modal or panel" },
      { keys: `${modifierLabel} + Shift + /`, action: "Show keyboard shortcuts" }
    ],
    [modifierLabel]
  );

  useEffect(() => {
    if (!shortcutsEnabled) return;

    function showShortcutToast(message: string, keys: string) {
      toast(`${message} — ${keys}`, { duration: 1500 });
    }

    function navigate(path: string, message: string, keys: string) {
      navigateWithSoftTransition(router, path);
      showShortcutToast(message, keys);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.repeat) return;

      if (event.key === "Escape") {
        closeOpenOverlays();
        window.dispatchEvent(new CustomEvent(CLOSE_OVERLAYS_EVENT));
        setReferenceOpen(false);
        return;
      }

      if (isEditableTarget(event.target)) return;
      if (!event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();
      const shortcutPrefix = modifierLabel;
      const shiftPressed = event.shiftKey || event.getModifierState("Shift");
      const slashKey = event.code === "Slash" || event.key === "/" || event.key === "?";
      const openReference = slashKey && (shiftPressed || event.key === "?");
      const focusSearch = slashKey && !openReference;

      if (openReference) {
        event.preventDefault();
        setReferenceOpen(true);
        showShortcutToast("Opening keyboard shortcuts", `${shortcutPrefix}+Shift+/`);
        return;
      }

      if (focusSearch) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT));
        showShortcutToast("Focusing search", `${shortcutPrefix}+/`);
        return;
      }

      const routes: Record<string, { path: string; message: string; keys: string }> = {
        n: { path: "/new", message: "Opening New Matter", keys: `${shortcutPrefix}+N` },
        d: { path: "/", message: "Opening Dashboard", keys: `${shortcutPrefix}+D` },
        m: { path: "/matters", message: "Opening Matters", keys: `${shortcutPrefix}+M` },
        c: { path: "/clients", message: "Opening Clients", keys: `${shortcutPrefix}+C` },
        t: { path: "/billing", message: "Opening Time & Billing", keys: `${shortcutPrefix}+T` },
        r: { path: "/resources", message: "Opening Resources", keys: `${shortcutPrefix}+R` },
        b: { path: "/my-firm", message: "Opening My Firm", keys: `${shortcutPrefix}+B` },
        ",": { path: "/settings", message: "Opening Settings", keys: `${shortcutPrefix}+,` }
      };

      const shiftedRoutes: Record<string, { path: string; message: string; keys: string }> = {
        d: { path: "/documents", message: "Opening Documents", keys: `${shortcutPrefix}+Shift+D` },
        c: { path: "/calendar", message: "Opening Calendar", keys: `${shortcutPrefix}+Shift+C` },
        a: { path: "/activity", message: "Opening Activity", keys: `${shortcutPrefix}+Shift+A` }
      };

      if (key === "k") {
        event.preventDefault();
        if (pathname.startsWith("/briefing")) {
          showShortcutToast("Kero AI is already open", `${shortcutPrefix}+K`);
        } else {
          window.dispatchEvent(new CustomEvent(OPEN_AI_EVENT));
          showShortcutToast("Opening Kero AI", `${shortcutPrefix}+K`);
        }
        return;
      }

      const route = routes[key];
      const shiftedRoute = shiftPressed ? shiftedRoutes[key] : undefined;
      if (shiftedRoute) {
        event.preventDefault();
        navigate(shiftedRoute.path, shiftedRoute.message, shiftedRoute.keys);
        return;
      }

      if (route) {
        event.preventDefault();
        navigate(route.path, route.message, route.keys);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modifierLabel, pathname, router, shortcutsEnabled, toast]);

  function dismissHint() {
    window.localStorage.setItem(HINT_STORAGE_KEY, "true");
    setHintVisible(false);
  }

  if (!shortcutsEnabled) return null;

  return (
    <>
      {hintVisible ? (
        <div className="fixed bottom-5 left-4 z-40 max-w-[calc(100vw-2rem)] rounded-md border border-primary/15 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-elevated md:left-[17.5rem]">
          <div className="flex items-center gap-3">
            <Keyboard className="h-4 w-4 shrink-0 text-primary" />
            <span>Tip: Press {modifierLabel}+Shift+/ to see all keyboard shortcuts</span>
            <button
              type="button"
              className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-slate-100 hover:text-slate-950"
              aria-label="Dismiss keyboard shortcut tip"
              onClick={dismissHint}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {referenceOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="keyboard-shortcuts-title">
          <div className="modal-panel max-w-2xl">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Keyboard className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="keyboard-shortcuts-title" className="text-lg font-semibold text-slate-950">
                    Keyboard shortcuts
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use these anywhere in Kero when you are not typing in a field.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close keyboard shortcuts"
                onClick={() => setReferenceOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="overflow-hidden rounded-md border">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.keys}
                  className="grid grid-cols-[9rem_1fr] items-center gap-4 border-b px-4 py-3 text-sm last:border-b-0"
                >
                  <kbd className="inline-flex w-fit rounded-md border bg-slate-50 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 shadow-[inset_0_-1px_0_rgba(15,23,42,0.08)]">
                    {shortcut.keys}
                  </kbd>
                  <span className="text-slate-700">{shortcut.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox']"
    )
  );
}

function closeOpenOverlays() {
  const modal = Array.from(document.querySelectorAll<HTMLElement>(".modal-backdrop")).at(-1);
  const closeButton = modal ? findModalCloseButton(modal) : null;
  closeButton?.click();
}

function findModalCloseButton(modal: HTMLElement) {
  const buttons = Array.from(modal.querySelectorAll<HTMLButtonElement>("button"));
  return (
    buttons.find((button) =>
      button.getAttribute("aria-label")?.toLowerCase().startsWith("close")
    ) ??
    buttons.find((button) => /^(cancel|close)$/i.test(button.textContent?.trim() ?? ""))
  );
}
