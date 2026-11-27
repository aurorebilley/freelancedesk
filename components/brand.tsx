import { PanelsTopLeft } from "lucide-react";

export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5 text-lg font-bold tracking-tight">
      <span className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-white">
        <PanelsTopLeft size={19} aria-hidden="true" />
      </span>
      FreelanceDesk
    </span>
  );
}
