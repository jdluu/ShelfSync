import { X } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

interface CoverViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  altText?: string;
}

export const CoverViewerModal: React.FC<CoverViewerModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  altText = "Book Cover",
}) => {
  // Use Escape key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
      {/* Close button layered on top */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-50 p-2 bg-black/50 text-white rounded-full hover:bg-black/80 transition-colors"
        aria-label="Close fullscreen cover"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Pinch to zoom wrapper */}
      <div className="w-full h-full flex items-center justify-center">
        <TransformWrapper
          initialScale={1}
          minScale={0.5}
          maxScale={5}
          centerOnInit={true}
          wheel={{ step: 0.1 }}
          doubleClick={{ mode: "zoomIn" }}
        >
          <TransformComponent
            wrapperClass="w-full h-full"
            contentClass="w-full h-full flex items-center justify-center"
          >
            <img
              src={imageUrl}
              alt={altText}
              className="max-w-full max-h-screen object-contain pointer-events-auto"
              draggable={false}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
};
