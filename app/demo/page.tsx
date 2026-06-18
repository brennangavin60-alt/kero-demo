"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { useKeroStore } from "@/lib/storage";

export default function DemoDataPage() {
  const router = useRouter();
  const { hydrated, loadDemoData } = useKeroStore();
  const { toast } = useToast();

  useEffect(() => {
    if (!hydrated) return;
    loadDemoData();
    toast("Demo data loaded");
    router.replace("/");
  }, [hydrated, loadDemoData, router, toast]);

  return (
    <div className="rounded-md border bg-white p-6 shadow-soft">
      <h1 className="text-xl font-semibold text-slate-950">Loading demo data...</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Kero is adding sample clients and matters to this browser.
      </p>
    </div>
  );
}
