import type React from "react";
import { cn } from "@/utils/cn";

export type ButtonVariant = "primary" | "outline" | "ghost" | "danger" | "plain";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends React.ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  danger: "btn-outline btn-error",
  plain: "",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "btn-sm",
  md: "",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "outline",
  size = "md",
  className,
  ref,
  children,
  ...props
}) => {
  const isPlain = variant === "plain";
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        isPlain ? "" : "btn",
        isPlain ? "" : variantClasses[variant],
        isPlain ? "" : sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
};
