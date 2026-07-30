"use client";

import { cn } from "@/lib/utils";

export function Spinner({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "sm" ? "h-4 w-4 border-2" : size === "lg" ? "h-10 w-10 border-[3px]" : "h-7 w-7 border-2";

  return (
    <div
      className={cn(
        "animate-spin rounded-full border-teal-700 border-t-transparent",
        sizeClass,
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <Spinner size="lg" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function InlineLoader({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
      <Spinner size="sm" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export function OverlayLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/70 backdrop-blur-[1px]">
      <Spinner />
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}
