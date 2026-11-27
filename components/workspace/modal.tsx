"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Modal({ title, locked, onClose, children, wide = false }: {
  title: string; locked: boolean; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby="dialog-title" className={wide ? "resource-dialog max-w-6xl" : "resource-dialog"} onCancel={event => {
      event.preventDefault();
      if (!locked) onClose();
    }}>
      <h2 id="dialog-title" className="mb-5 text-xl font-bold">{title}</h2>
      {children}
    </dialog>
  );
}
