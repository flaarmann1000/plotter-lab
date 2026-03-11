import { ButtonHTMLAttributes } from "react";
import clsx from "clsx";

type Variant = "primary" | "outline" | "ghost";
type Size = "sm" | "md";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-slate-100 text-slate-900 hover:bg-white/90 dark:bg-slate-100 dark:text-slate-900",
  outline:
    "border border-white/20 bg-transparent text-white hover:bg-white/10",
  ghost: "text-slate-200 hover:bg-white/10 focus-visible:bg-white/10",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  busy?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  busy = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "rounded-md font-medium transition-colors",
        variantClasses[variant],
        sizeClasses[size],
        (disabled || busy) && "opacity-50 cursor-not-allowed",
        className,
      )}
      disabled={disabled || busy}
      {...props}
    >
      {children}
    </button>
  );
}

