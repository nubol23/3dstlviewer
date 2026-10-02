import type { ComponentPropsWithoutRef, ReactNode } from "react";

type IconButtonProps = {
  icon: ReactNode;
  label: string;
  showLabel?: boolean;
  variant?: "ghost" | "solid" | "primary";
} & Omit<ComponentPropsWithoutRef<"button">, "children">;

export function IconButton({
  icon,
  label,
  showLabel = false,
  variant = "ghost",
  className,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn--${variant}${showLabel ? "" : " btn--icon"}${className ? ` ${className}` : ""}`}
      aria-label={showLabel ? undefined : label}
      title={showLabel ? undefined : label}
      {...props}
    >
      <span className="btn__icon" aria-hidden="true">{icon}</span>
      {showLabel && <span className="btn__label">{label}</span>}
    </button>
  );
}
