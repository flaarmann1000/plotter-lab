import { ReactNode } from "react";
import clsx from "clsx";

interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Section({
  title,
  description,
  children,
  className,
}: SectionProps) {
  return (
    <section
      className={clsx(
        "rounded-xl border border-white/10 bg-slate-900/70 p-4 shadow-inner shadow-black/20",
        className,
      )}
    >
      <header className="mb-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        {description ? (
          <p className="text-xs text-slate-400">{description}</p>
        ) : null}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

