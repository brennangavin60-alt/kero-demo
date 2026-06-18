"use client";

type KeroRouter = {
  push: (href: string) => void;
};

export function navigateWithSoftTransition(router: KeroRouter, href: string, beforeNavigate?: () => void) {
  beforeNavigate?.();
  router.push(href);
}
