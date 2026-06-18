"use client";

import { useEffect } from "react";
import { getFirmTitle } from "@/lib/personalisation";
import { useKeroStore } from "@/lib/storage";

export function DocumentTitle() {
  const { state, hydrated } = useKeroStore();

  useEffect(() => {
    if (!hydrated) return;
    document.title = getFirmTitle(state.settings);
    document.documentElement.dataset.theme = state.settings.appearance.theme;
    document.documentElement.dataset.accent = state.settings.appearance.accentColor;
  }, [hydrated, state.settings]);

  return null;
}
