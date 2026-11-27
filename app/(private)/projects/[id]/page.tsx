import type { Metadata } from "next";

import { ResourceDetail } from "@/components/workspace/detail";

export const metadata: Metadata = { title: "Fiche projet" };

export default async function Page({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  return <ResourceDetail collection="projects" id={id} />;
}
