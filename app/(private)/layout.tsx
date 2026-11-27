import type { ReactNode } from "react";

import { SessionGate } from "@/components/session";
import { WorkspaceShell } from "@/components/workspace/shell";

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return <SessionGate access="private"><WorkspaceShell>{children}</WorkspaceShell></SessionGate>;
}
