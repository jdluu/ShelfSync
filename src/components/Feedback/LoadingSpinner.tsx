import type React from "react";

interface LoadingSpinnerProps {
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = "Loading..." }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4">
      <span className="loading loading-spinner text-accent loading-lg"></span>
      <p className="text-base-content/60">{message}</p>
    </div>
  );
};
