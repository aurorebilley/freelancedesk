import type { Metadata } from "next";

import { ResourceDetail } from "@/components/workspace/detail";

export const metadata: Metadata = { title: "Fiche client" };

export default async function Page({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  return <ResourceDetail collection="clients" id={id} />;
}
