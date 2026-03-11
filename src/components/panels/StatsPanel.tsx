"use client";

import { Section } from "@/components/ui/Section";
import { usePlotterStore } from "@/store/plotterStore";

export function StatsPanel() {
  const stats = usePlotterStore((state) => state.stats);
  const status = usePlotterStore((state) => state.status);

  return (
    <Section
      title="Plot statistics"
      description="Helps keep plotting times predictable."
    >
      {stats ? (
        <dl className="grid grid-cols-2 gap-2 text-xs text-slate-200">
          <div>
            <dt className="text-slate-500">Paths</dt>
            <dd className="text-lg font-semibold">{stats.pathCount}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Segments</dt>
            <dd className="text-lg font-semibold">{stats.segmentCount}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Pen-down length</dt>
            <dd className="text-lg font-semibold">
              {stats.penDownLength.toFixed(0)} px
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Pen-up travel</dt>
            <dd className="text-lg font-semibold">
              {stats.penUpLength.toFixed(0)} px
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-xs text-slate-500">
          {status === "computing"
            ? "Crunching numbers..."
            : "Import or generate content to see stats."}
        </p>
      )}
    </Section>
  );
}
