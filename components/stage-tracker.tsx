"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast-provider";
import { getCurrentStage, getStages } from "@/lib/stages";
import { useKeroStore } from "@/lib/storage";
import { cn } from "@/lib/utils";
import type { Matter } from "@/lib/types";

export function StageTracker({ matter }: { matter: Matter }) {
  const stages = getStages(matter.type);
  const { state, advanceStage, hasPermission } = useKeroStore();
  const { toast } = useToast();
  const isComplete = matter.stageIndex >= stages.length - 1;
  const amlBlocked =
    state.settings.matterDefaults.amlMandatoryBeforeStageAdvance && !matter.aml.verified;
  const canOpenCloseMatters = hasPermission("openCloseMatters");

  function onAdvance() {
    if (!canOpenCloseMatters) {
      toast("Your role cannot open or close matters");
      return;
    }
    if (amlBlocked) {
      toast("AML must be verified before this matter can advance");
      return;
    }
    const updated = advanceStage(matter.id);
    if (updated) {
      toast(`Moved to ${getCurrentStage(updated)}`);
    }
  }

  return (
    <section className="surface-card overflow-hidden p-0">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="px-4 pt-4">
          <h2 className="section-heading">Current stage</h2>
          <p className="section-copy">
            Stage {matter.stageIndex + 1} of {stages.length} · {getCurrentStage(matter)}
          </p>
        </div>
        <div className="px-4 pt-4">
          <Button onClick={onAdvance} disabled={isComplete || amlBlocked || !canOpenCloseMatters}>
            <CheckCircle2 className="h-4 w-4" />
            Advance
          </Button>
        </div>
      </div>
      {!canOpenCloseMatters ? (
        <p className="mx-4 mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-muted-foreground">
          Your role can view this stage tracker but cannot advance or close matters.
        </p>
      ) : null}
      {amlBlocked ? (
        <p className="mx-4 mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          AML verification is required before this matter can move stage.
        </p>
      ) : null}
      <div className="mx-4 mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${((matter.stageIndex + 1) / stages.length) * 100}%` }}
        />
      </div>
      <div className="grid gap-2 border-t bg-slate-50/70 p-4 md:grid-cols-2 xl:grid-cols-4">
        {stages.map((stage, index) => {
          const complete = index < matter.stageIndex;
          const current = index === matter.stageIndex;
          return (
            <div
              key={stage}
              className={cn(
                "min-h-16 rounded-md border px-3 py-2.5 text-sm transition-all duration-300",
                complete && "border-primary/20 bg-white text-slate-800 shadow-soft",
                current && "stage-pulse border-primary bg-primary text-white shadow-elevated",
                !complete && !current && "bg-slate-50 text-slate-600"
              )}
            >
              <div className="flex items-center gap-2 text-xs font-medium opacity-75">
                {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                Stage {index + 1}
              </div>
              <div className="mt-1 font-semibold leading-5">{stage}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
