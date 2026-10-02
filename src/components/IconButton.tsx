import type { ComponentPropsWithoutRef, ReactNode } from "react";

type IconButtonProps = {
  icon: ReactNode;
  label: string;
} & Omit<ComponentPropsWithoutRef<"button">, "children">;

export function IconButton({ icon, label, className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn--ghost btn--icon${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <span className="btn__icon" aria-hidden="true">{icon}</span>
    </button>
  );
}
