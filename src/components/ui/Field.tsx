import type React from "react";
import { cn } from "@/utils/cn";

export interface FieldProps extends Omit<React.ComponentProps<"input">, "id"> {
  id: string;
  label: React.ReactNode;
  error?: string;
  errorId?: string;
  helper?: string;
  helperId?: string;
  inputClassName?: string;
}

export const Field: React.FC<FieldProps> = ({
  id,
  label,
  error,
  errorId = `${id}-error`,
  helper,
  helperId = `${id}-helper`,
  inputClassName,
  type = "text",
  "aria-describedby": ariaDescribedBy,
  className,
  ...inputProps
}) => {
  const describedByRefs = [helper ? helperId : null, error ? errorId : null].filter(Boolean);
  const describedBy = describedByRefs.length > 0 ? describedByRefs.join(" ") : undefined;
  const resolvedDescribedBy = ariaDescribedBy ?? describedBy;

  return (
    <div className="form-control w-full">
      <label htmlFor={id}>
        <span className="label-text mb-1 font-medium">{label}</span>
        <input
          id={id}
          type={type}
          aria-invalid={error ? true : undefined}
          aria-describedby={resolvedDescribedBy}
          className={cn("input input-bordered w-full", error && "input-error", inputClassName)}
          {...inputProps}
        />
      </label>
      {helper && (
        <p id={helperId} className="text-xs text-base-content/60 mt-1">
          {helper}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-error mt-0.5">
          {error}
        </p>
      )}
    </div>
  );
};
