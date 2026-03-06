import type React from "react";

interface ClientErrorBannerProps {
  error: string;
  clearError: () => void;
}

export const ClientErrorBanner: React.FC<ClientErrorBannerProps> = ({ error, clearError }) => {
  return (
    <div role="alert" className="alert alert-error mb-6 flex justify-between items-start">
      <div className="flex gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="stroke-current shrink-0 h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{error}</span>
      </div>
      <button type="button" onClick={clearError} className="btn btn-ghost btn-xs btn-circle">
        ✕
      </button>
    </div>
  );
};
