import type { Metadata } from "next";

import { ResourceDetail } from "@/components/workspace/detail";

export const metadata: Metadata = { title: "Fiche facture" };

export default async function Page({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  return <ResourceDetail collection="invoices" id={id} />;
}
