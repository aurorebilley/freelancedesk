import type { Metadata } from "next";

import { Finances } from "@/components/workspace/finances";

export const metadata: Metadata = { title: "Finances" };

export default function FinancesPage() {
  return <Finances />;
}
