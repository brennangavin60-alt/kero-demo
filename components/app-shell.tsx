"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BotMessageSquare,
  CalendarDays,
  Building2,
  History,
  Files,
  FilePlus2,
  FolderKanban,
  LibraryBig,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Settings,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { FloatingKeroAi } from "@/components/floating-kero-ai";
import { GlobalSearch } from "@/components/global-search";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { KeroLogo } from "@/components/kero-logo";
import { getFirmName, getSolicitorName } from "@/lib/personalisation";
import type { PermissionKey } from "@/lib/permissions";
import { useKeroStore } from "@/lib/storage";
import { navigateWithSoftTransition } from "@/lib/navigation-transition";
import { cn } from "@/lib/utils";

const DESKTOP_SIDEBAR_STORAGE_KEY = "kero-desktop-sidebar-open";

const navItems: Array<{
  href: string;
  label: string;
  description: string;
  shortcut: string;
  icon: typeof LayoutDashboard;
  permission: PermissionKey;
}> = [
  { href: "/", label: "Dashboard", description: "See today’s overview", shortcut: "Ctrl+D", icon: LayoutDashboard, permission: "viewDashboard" },
  { href: "/briefing", label: "Kero AI", description: "Ask, brief and update files", shortcut: "Ctrl+K", icon: BotMessageSquare, permission: "viewKeroAi" },
  { href: "/new", label: "New Matter", description: "Open a new matter", shortcut: "Ctrl+N", icon: FilePlus2, permission: "createMatter" },
  { href: "/matters", label: "Matters", description: "Search and manage files", shortcut: "Ctrl+M", icon: FolderKanban, permission: "viewMatters" },
  { href: "/documents", label: "Documents", description: "Letters and templates", shortcut: "Ctrl+Shift+D", icon: Files, permission: "viewDocuments" },
  { href: "/calendar", label: "Calendar", description: "Dates, meetings and deadlines", shortcut: "Ctrl+Shift+C", icon: CalendarDays, permission: "viewCalendar" },
  { href: "/activity", label: "Activity", description: "Review recent actions", shortcut: "Ctrl+Shift+A", icon: History, permission: "viewActivity" },
  { href: "/billing", label: "Time & Billing", description: "Track time and invoices", shortcut: "Ctrl+T", icon: ReceiptText, permission: "viewBilling" },
  { href: "/my-firm", label: "My Firm", description: "Firm stats and team", shortcut: "Ctrl+B", icon: Building2, permission: "viewFirmHub" },
  { href: "/resources", label: "Resources", description: "Irish legal tools and links", shortcut: "Ctrl+R", icon: LibraryBig, permission: "viewResources" },
  { href: "/clients", label: "Clients", description: "View client records", shortcut: "Ctrl+C", icon: UsersRound, permission: "viewClients" },
  { href: "/settings", label: "Settings", description: "Configure Kero", shortcut: "Ctrl+,", icon: Settings, permission: "manageFirmSettings" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, hydrated, currentTeamMember, hasPermission } = useKeroStore();
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const solicitorName = hydrated ? getSolicitorName(state.settings) : "";
  const firmName = hydrated ? getFirmName(state.settings) : "your firm";
  const firmWebsite = hydrated ? state.settings.firmWebsite : "";
  const visibleNavItems = navItems.filter((item) => hasPermission(item.permission));

  useEffect(() => {
    const saved = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY);
    if (saved) setDesktopSidebarOpen(saved === "true");
  }, []);

  useEffect(() => {
    function closeOverlays() {
      setAppMenuOpen(false);
    }

    window.addEventListener("kero:close-overlays", closeOverlays);
    return () => window.removeEventListener("kero:close-overlays", closeOverlays);
  }, []);

  function toggleDesktopSidebar() {
    const next = !desktopSidebarOpen;
    const applySidebarState = () => {
      setDesktopSidebarOpen(next);
      window.localStorage.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, String(next));
    };

    const startViewTransition = (document as DocumentWithViewTransition).startViewTransition;
    if (!startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applySidebarState();
      return;
    }

    startViewTransition.call(document, () => {
      flushSync(applySidebarState);
    });
  }

  return (
    <div className="min-h-screen">
      <aside
        className={cn(
          "desktop-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-white/10 bg-[linear-gradient(180deg,hsl(var(--primary)/0.94)_0%,hsl(222_54%_11%/0.94)_100%)] text-white shadow-elevated backdrop-blur-xl md:flex md:flex-col",
          !desktopSidebarOpen && "desktop-sidebar-hidden"
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.025] pr-3 backdrop-blur-xl">
          <SidebarLogo />
          <button
            type="button"
            className="relative z-10 hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/65 transition-all duration-200 hover:bg-white/10 hover:text-white md:flex"
            aria-label="Hide sidebar"
            title="Hide sidebar"
            onClick={toggleDesktopSidebar}
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto px-3 py-4">
          {visibleNavItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <SidebarNavLink
                key={item.href}
                item={item}
                active={active}
              />
            );
          })}
        </nav>
        <SidebarProfile
          solicitorName={solicitorName}
          firmName={firmName}
          firmWebsite={firmWebsite}
          role={currentTeamMember.role}
        />
      </aside>

      <header className="sticky top-0 z-20 border-b border-white/10 bg-[linear-gradient(180deg,hsl(var(--primary)/0.9)_0%,hsl(222_54%_13%/0.9)_100%)] text-white shadow-soft backdrop-blur-xl md:hidden">
        <div className="flex h-16 items-center justify-between gap-3 px-4">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/10 text-white transition-all duration-200 hover:bg-white/20 active:scale-[0.98]"
            aria-label="Open menu"
            aria-expanded={appMenuOpen}
            onClick={() => setAppMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-2 font-semibold" onClick={() => setAppMenuOpen(false)}>
            <KeroLogo className="h-9 w-9" imageClassName="h-[82%] w-[82%]" />
            <span className="text-lg">Kero</span>
          </Link>
          <GlobalSearch className="max-w-[12rem]" />
        </div>
      </header>

      {appMenuOpen ? (
        <AppMenuOverlay
          items={visibleNavItems}
          pathname={pathname}
          onClose={() => setAppMenuOpen(false)}
        />
      ) : null}

      <main
        className={cn(
          "desktop-main",
          desktopSidebarOpen ? "desktop-main-sidebar-open" : "desktop-main-sidebar-closed"
        )}
      >
        <div className="sticky top-0 z-20 hidden border-b border-white/70 bg-white/60 px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.75),0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur-2xl md:block sm:px-6 lg:px-8">
          <div
            className={cn(
              "app-width-shell mx-auto flex w-full items-center justify-between gap-3",
              !desktopSidebarOpen && "app-width-shell-expanded"
            )}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 text-xs font-semibold text-slate-700 shadow-soft backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white hover:text-primary hover:shadow-elevated"
                aria-label="Open menu"
                aria-expanded={appMenuOpen}
                onClick={() => setAppMenuOpen(true)}
              >
                <Menu className="h-4 w-4" />
                Menu
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 text-xs font-semibold text-slate-700 shadow-soft backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-white hover:text-primary hover:shadow-elevated"
                aria-label={desktopSidebarOpen ? "Hide sidebar" : "Show sidebar"}
                aria-pressed={desktopSidebarOpen}
                onClick={toggleDesktopSidebar}
              >
                {desktopSidebarOpen ? (
                  <PanelLeftClose className="h-4 w-4" />
                ) : (
                  <PanelLeftOpen className="h-4 w-4" />
                )}
                {desktopSidebarOpen ? "Hide sidebar" : "Show sidebar"}
              </button>
            </div>
            <GlobalSearch />
          </div>
        </div>
        <div
          key={pathname}
          className={cn(
            "page-route-enter app-width-shell mx-auto w-full px-4 py-5 sm:px-6 sm:py-6 lg:px-8",
            !desktopSidebarOpen && "app-width-shell-expanded"
          )}
        >
          {children}
        </div>
      </main>
      <KeyboardShortcuts />
      <FloatingKeroAi />
    </div>
  );
}

type NavItem = (typeof navItems)[number];

function AppMenuOverlay({
  items,
  pathname,
  onClose
}: {
  items: NavItem[];
  pathname: string;
  onClose: () => void;
}) {
  const router = useRouter();

  function openSection(event: React.MouseEvent<HTMLAnchorElement>, item: NavItem, active: boolean) {
    onClose();
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      active
    ) {
      return;
    }

    event.preventDefault();
    navigateWithSoftTransition(router, item.href);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="app-menu-title">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close menu"
        onClick={onClose}
      />
      <section className="app-menu-panel modal-panel relative max-h-[min(46rem,calc(100vh-2rem))] max-w-5xl overflow-hidden p-0">
        <div className="app-menu-header flex items-center justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-3" onClick={onClose}>
            <KeroLogo className="h-12 w-12 shadow-elevated transition-transform duration-300 group-hover:scale-[1.04]" imageClassName="h-[82%] w-[82%]" />
            <span className="min-w-0">
              <span id="app-menu-title" className="block text-2xl font-bold tracking-normal text-primary">
                Kero
              </span>
              <span className="block text-sm font-semibold text-muted-foreground">
                Choose where to work next
              </span>
            </span>
          </Link>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:text-primary hover:shadow-elevated"
            aria-label="Close menu"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="app-menu-body max-h-[calc(100vh-8rem)] overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(event) => openSection(event, item, active)}
                  className={cn(
                    "app-menu-card group flex min-h-[8.5rem] flex-col justify-between rounded-2xl p-4 text-white transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-white active:scale-[0.985]",
                    active && "app-menu-card-active"
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="app-menu-icon flex h-11 w-11 items-center justify-center rounded-xl text-white transition-all duration-300">
                      <Icon className="h-5 w-5" />
                    </span>
                    <kbd className="app-menu-shortcut rounded-full px-2 py-1 font-mono text-[10px] font-bold leading-none">
                      {item.shortcut}
                    </kbd>
                  </span>
                  <span>
                    <span className="block text-base font-bold leading-tight">{item.label}</span>
                    <span className="mt-1 block text-xs font-semibold text-white/58">
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </section>
    </div>
  );
}

function SidebarLogo() {
  return (
    <Link
      href="/"
      aria-label="Kero dashboard"
      className="group relative z-10 flex h-16 items-center gap-3.5 px-5 transition-opacity duration-200 hover:opacity-95"
    >
      <KeroLogo
        className="h-10 w-10 rounded-xl border border-white/75 bg-white shadow-soft ring-1 ring-white/15 transition-transform duration-300 group-hover:scale-[1.03]"
        imageClassName="h-[82%] w-[82%]"
      />
      <span className="flex min-w-0 items-baseline">
        <span className="block text-[1.65rem] font-bold leading-none tracking-normal text-white">
          Kero
        </span>
      </span>
    </Link>
  );
}

function SidebarNavLink({
  item,
  active,
  onClick
}: {
  item: NavItem;
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  const router = useRouter();

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    onClick?.();
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      active
    ) {
      return;
    }

    event.preventDefault();
    navigateWithSoftTransition(router, item.href);
  }

  return (
    <Link
      href={item.href}
      onClick={handleClick}
      className={cn(
        "group flex min-h-[46px] items-center gap-3.5 rounded-full px-3.5 text-[15px] font-semibold leading-none text-white/76 transition-all duration-200 hover:translate-x-0.5 hover:bg-white/[0.12] hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        active && "bg-white/[0.92] text-primary shadow-elevated backdrop-blur hover:bg-white hover:text-primary"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 transition-colors duration-200 group-hover:bg-white/20",
          active && "bg-primary/10"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      {item.label}
    </Link>
  );
}

function SidebarProfile({
  solicitorName,
  firmName,
  firmWebsite,
  role
}: {
  solicitorName: string;
  firmName: string;
  firmWebsite: string;
  role: string;
}) {
  const websiteUrl = normaliseWebsiteUrl(firmWebsite);
  const profileContent = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-soft">
        <UserRound className="h-5 w-5" />
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-semibold text-white">
          {solicitorName || "Solicitor"}
        </span>
        <span className="block truncate text-xs text-white/70">{firmName}</span>
        <span className="block truncate text-[11px] font-semibold text-white/45">{role}</span>
      </span>
    </>
  );

  return (
    <div className="border-t border-white/10 px-4 py-4">
      {websiteUrl ? (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/10 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.99]"
          aria-label={`Open ${firmName} website`}
        >
          {profileContent}
        </a>
      ) : (
        <button
          type="button"
          className="group relative flex w-full cursor-default items-center gap-3 rounded-lg border border-white/10 bg-white/10 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          aria-label="Add your firm website in Settings"
        >
          {profileContent}
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 w-max max-w-[13rem] -translate-x-1/2 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-primary opacity-0 shadow-elevated transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            Add your firm website in Settings
          </span>
        </button>
      )}
    </div>
  );
}

function normaliseWebsiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void) => {
    finished: Promise<void>;
    ready: Promise<void>;
    updateCallbackDone: Promise<void>;
    skipTransition: () => void;
  };
};
