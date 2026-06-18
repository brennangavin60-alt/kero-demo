"use client";

import { StoreProvider } from "@/lib/storage";
import { DocumentTitle } from "@/components/document-title";
import { ToastProvider } from "@/components/toast-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <ToastProvider>
        <DocumentTitle />
        {children}
      </ToastProvider>
    </StoreProvider>
  );
}
