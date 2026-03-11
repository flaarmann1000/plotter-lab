import { ReactNode } from "react";
import clsx from "clsx";

interface FieldProps {
  label: string;
  description?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  description,
  htmlFor,
  children,
  className,
}: FieldProps) {
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-400">
        <label htmlFor={htmlFor}>{label}</label>
        {description ? (
          <span className="text-slate-500 normal-case">{description}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

