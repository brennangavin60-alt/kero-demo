import { MatterListView } from "@/components/matter-list-view";
import { parseMatterFilter, parseStatusFilter } from "@/lib/matter-filters";

export default function MattersPage({
  searchParams
}: {
  searchParams?: {
    q?: string | string[];
    status?: string | string[];
    type?: string | string[];
  };
}) {
  const type = Array.isArray(searchParams?.type)
    ? searchParams?.type[0]
    : searchParams?.type;
  const status = Array.isArray(searchParams?.status)
    ? searchParams?.status[0]
    : searchParams?.status;
  const query = Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q;

  return (
    <MatterListView
      title="Matters"
      initialTypeFilter={parseMatterFilter(type)}
      initialStatusFilter={parseStatusFilter(status)}
      initialQuery={query ?? ""}
    />
  );
}
