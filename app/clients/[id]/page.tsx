import { ClientDetail } from "@/components/client-pages";

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  return <ClientDetail clientId={params.id} />;
}
