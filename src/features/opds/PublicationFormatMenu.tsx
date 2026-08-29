import { ChevronDown as ChevronDownIcon } from "lucide-react";
import type React from "react";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { MediaType } from "@/types/opds";
import { getMediaTypeDisplayLabel } from "@/types/opds";

function getMediaTypeLabel(mediaType: MediaType): string {
  return getMediaTypeDisplayLabel(mediaType);
}

interface PublicationFormatMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  formats: MediaType[];
  selectedFormat: MediaType | null;
  onSelectFormat: (format: MediaType) => void;
  disabled: boolean;
  triggerText: string;
  triggerAriaLabel?: string;
}

export const PublicationFormatMenu: React.FC<PublicationFormatMenuProps> = ({
  isOpen,
  onOpenChange,
  formats,
  selectedFormat,
  onSelectFormat,
  disabled,
  triggerText,
  triggerAriaLabel,
}) => {
  const formatMenuContainerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const triggerId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
        triggerRef.current?.focus();
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (
        formatMenuContainerRef.current &&
        event.target instanceof Node &&
        !formatMenuContainerRef.current.contains(event.target)
      ) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen, onOpenChange]);

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "Tab") {
      onOpenChange(false);
      return;
    }
    if (formats.length === 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (index + 1) % formats.length;
    else if (event.key === "ArrowUp") nextIndex = (index - 1 + formats.length) % formats.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = formats.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div ref={formatMenuContainerRef} className="relative inline-block w-full">
      <Button
        ref={triggerRef}
        id={triggerId}
        variant="outline"
        size="sm"
        onClick={() => onOpenChange(!isOpen)}
        disabled={disabled}
        className={`w-full justify-between ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={
          triggerAriaLabel ??
          (selectedFormat
            ? `Selected format: ${getMediaTypeLabel(selectedFormat)}, change format`
            : "Select download format")
        }
      >
        <span>{triggerText}</span>
        <ChevronDownIcon className="w-4 h-4" aria-hidden="true" />
      </Button>
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={triggerId}
          className="absolute z-10 mt-1 w-full bg-base-100 border border-base-content/20 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {formats.map((format, index) => (
            <Button
              key={format}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              variant="plain"
              onClick={() => {
                onSelectFormat(format);
                onOpenChange(false);
                triggerRef.current?.focus();
              }}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              disabled={disabled}
              className={`w-full px-3 py-2 text-left text-sm rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary hover:bg-base-200 ${
                selectedFormat === format ? "bg-primary/10 font-medium" : ""
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              role="option"
              aria-selected={selectedFormat === format}
            >
              {getMediaTypeLabel(format)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

export { getMediaTypeLabel };
