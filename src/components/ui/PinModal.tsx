import { Lock } from "lucide-react";
import type React from "react";
import { useState } from "react";

interface PinModalProps {
  hostName: string;
  onPair: (pin: string) => void;
  onCancel: () => void;
  loading?: boolean;
}

export const PinModal: React.FC<PinModalProps> = ({ hostName, onPair, onCancel, loading }) => {
  const [pin, setPin] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length >= 4) {
      onPair(pin);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
    >
      <div className="bg-base-200 p-8 rounded-xl shadow-2xl max-w-sm w-full border border-base-300">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex justify-center">
            <div className="bg-primary/20 p-4 rounded-full">
              <Lock size={32} className="text-primary" />
            </div>
          </div>

          <div className="text-center flex flex-col gap-1">
            <h2 id="pin-modal-title" className="text-2xl font-bold">
              Pairing Required
            </h2>
            <p className="text-sm text-base-content/70">
              Enter the 4-digit PIN displayed on <strong>{hostName}</strong>
            </p>
          </div>

          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").substring(0, 4))}
            placeholder="0000"
            className="input input-lg text-center text-2xl font-bold tracking-widest w-full bg-base-100"
            disabled={loading}
            aria-label="4-digit pairing PIN"
            inputMode="numeric"
            autoComplete="one-time-code"
          />

          <div className="flex w-full gap-3">
            <button
              type="button"
              className="btn btn-ghost flex-1"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={pin.length < 4 || loading}
            >
              {loading ? (
                <span className="loading loading-spinner text-primary-content"></span>
              ) : (
                "Pair Device"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
