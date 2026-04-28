"use client";

import { useEffect } from "react";

export type ToastType = "success" | "error" | "info";

export function Toast({
  open,
  type,
  message,
  onClose,
}: {
  open: boolean;
  type: ToastType;
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [open, onClose]);

  if (!open) return null;

  const styles =
    type === "success"
      ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
      : type === "error"
      ? "border-red-400/50 bg-red-500/15 text-red-100"
      : "border-[#FFB31A]/50 bg-[#FFB31A]/15 text-[#FFE1A0]";

  return (
    <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 px-4 w-full max-w-xl">
      <div
        className={`rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md animate-fadeIn ${styles}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="font-medium leading-snug">{message}</div>
          <button
            onClick={onClose}
            className="text-sm opacity-70 hover:opacity-100 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
