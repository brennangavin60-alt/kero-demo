"use client";

import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { EmptyState, PageSkeleton } from "@/components/ui/states";
import { buttonVariants } from "@/components/ui/button";
import type { PermissionKey } from "@/lib/permissions";
import { useKeroStore } from "@/lib/storage";

export function PermissionGate({
  permission,
  children,
  label = "this area"
}: {
  permission: PermissionKey;
  children: React.ReactNode;
  label?: string;
}) {
  const { hydrated, currentTeamMember, hasPermission } = useKeroStore();

  if (!hydrated) return <PageSkeleton rows={4} />;
  if (hasPermission(permission)) return <>{children}</>;

  return (
    <EmptyState
      icon={ShieldAlert}
      title="Access restricted"
      description={`${currentTeamMember.role} does not have permission to access ${label}.`}
      className="surface-card min-h-[24rem]"
    >
        <Link href="/my-firm" className={buttonVariants({ variant: "outline" })}>
          View My Firm
        </Link>
    </EmptyState>
  );
}
