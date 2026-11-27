import type { Metadata } from "next";

import { ResourceList } from "@/components/workspace/lists";

export const metadata: Metadata = { title: "Factures" };

export default function Page() {
  return <ResourceList collection="invoices" />;
}
