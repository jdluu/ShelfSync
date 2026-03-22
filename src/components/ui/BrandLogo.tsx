import type React from "react";
import logo from "@/assets/logo.png";

interface BrandLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = "", size = "md" }) => {
  const sizeClasses = {
    sm: "w-6 h-6",
    md: "w-8 h-8",
    lg: "w-12 h-12",
    xl: "w-16 h-16",
  };

  return (
    <img
      src={logo}
      alt="ShelfSync Logo"
      className={`${sizeClasses[size]} ${className} object-contain`}
      draggable={false}
    />
  );
};
