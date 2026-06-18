import { MatterDetail } from "@/components/matter-detail";

export default function MatterDetailPage({ params }: { params: { id: string } }) {
  return <MatterDetail matterId={params.id} />;
}
