"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = {
  id: string;
  message: string;
  leaving?: boolean;
};

type ToastContextValue = {
  toast: (message: string, options?: { duration?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);
const TOAST_EXIT_MS = 260;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, options?: { duration?: number }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((current) => [...current, { id, message }]);
    window.setTimeout(() => {
      setToasts((current) =>
        current.map((item) => (item.id === id ? { ...item, leaving: true } : item))
      );
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== id));
      }, TOAST_EXIT_MS);
    }, options?.duration ?? 3000);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 sm:bottom-5 sm:right-5">
        {toasts.map((item) => {
          const error = isErrorToast(item.message);
          const Icon = error ? AlertTriangle : CheckCircle2;
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-start gap-3 rounded-lg border bg-white/95 px-4 py-3 text-sm font-semibold shadow-elevated backdrop-blur-md",
                item.leaving ? "toast-exit" : "toast-enter",
                error ? "border-red-200 text-red-800" : "border-primary/20 text-slate-900"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg",
                  error ? "bg-red-50 text-red-700" : "bg-primary/10 text-primary"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="leading-6">{item.message}</span>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}

function isErrorToast(message: string) {
  return /\b(error|failed|cannot|could not|blocked|required|missing|deleted)\b/i.test(message);
}
