"use client";

import {
  BookOpenText,
  Building2,
  ExternalLink,
  Landmark,
  MapPinned,
  ReceiptText,
  Scale,
  Search,
  ShieldCheck
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { displayResourceUrl, resourceCategories, type ResourceCategory } from "@/lib/resources";

const resourceIcons: Record<string, LucideIcon> = {
  "Land Registry": Landmark,
  Searches: Search,
  Court: Scale,
  "Legal Research": BookOpenText,
  "Revenue & Tax": ReceiptText,
  Compliance: ShieldCheck,
  "Conveyancing Specific": MapPinned
};

export function ResourcesPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building2 className="h-5 w-5" />
            </span>
            <h1 className="text-3xl font-bold text-slate-950">Resources</h1>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Quick links to external services and reference sites commonly used by Irish solicitors.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {resourceCategories.map((category) => (
          <ResourceCategoryCard key={category.title} category={category} />
        ))}
      </div>
    </div>
  );
}

function ResourceCategoryCard({ category }: { category: ResourceCategory }) {
  const Icon = resourceIcons[category.title] ?? Building2;
  return (
    <section className="surface-card overflow-hidden">
      <div className="flex items-center gap-3 border-b bg-slate-50 px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <h2 className="text-base font-semibold text-slate-950">{category.title}</h2>
      </div>
      <div className="divide-y">
        {category.links.map((link) => (
          <a
            key={link.title}
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="group grid gap-1 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-950">
              <span>{link.title}</span>
              <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition-colors duration-200 group-hover:text-primary" />
            </span>
            <span className="text-sm leading-6 text-muted-foreground">{link.description}</span>
            <span className="truncate text-xs font-medium text-primary">{displayResourceUrl(link.url)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
