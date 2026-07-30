"use client";

import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type ThreadStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES: Record<ThreadStatus, string> = {
  replied: "bg-emerald-50 text-emerald-800 border-emerald-200",
  not_replied: "bg-rose-50 text-rose-800 border-rose-200",
  replied_by_other: "bg-amber-50 text-amber-900 border-amber-200",
  needs_followup: "bg-orange-50 text-orange-900 border-orange-200",
};

export function StatusBadge({ status }: { status: ThreadStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STYLES[status] || "bg-slate-50 text-slate-700")}
    >
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

export function TagChip({
  name,
  color,
  onRemove,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        backgroundColor: `${color}18`,
        borderColor: `${color}55`,
        color,
      }}
    >
      +{name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-0.5 opacity-70 hover:opacity-100">
          ×
        </button>
      )}
    </span>
  );
}
