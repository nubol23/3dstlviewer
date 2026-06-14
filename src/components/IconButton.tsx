import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "solid" | "ghost" | "danger";

type IconButtonProps = {
  children: ReactNode;
  icon?: ReactNode;
  variant?: Variant;
  isActive?: boolean;
} & ComponentPropsWithoutRef<"button">;

export function IconButton({
  children,
  icon,
  variant = "ghost",
  isActive,
  disabled,
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      className={`icon-btn icon-btn-${variant}${isActive ? " is-active" : ""}${disabled ? " is-disabled" : ""} ${className ?? ""}`}
      disabled={disabled}
      {...props}
    >
      {icon ? <span className="icon-btn__icon">{icon}</span> : null}
      <span className="icon-btn__label">{children}</span>
    </button>
  );
}

