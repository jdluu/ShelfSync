import { Monitor, Smartphone } from "lucide-react";
import type React from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";

interface RoleSelectionProps {
  onSelect: (role: "host" | "client") => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect }) => {
  return (
    <div className="min-h-screen flex flex-col bg-base-100 font-sans selection:bg-primary/30">
      <SkipLink />

      <Header title="Choose Your Role" />

      {/* Main Content */}
      <main id="main-content" className="flex-grow flex flex-col p-4 sm:p-6 pt-8 sm:pt-12">
        <div className="container max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            {/* Host Card */}
            <button
              type="button"
              onClick={() => onSelect("host")}
              className="card bg-base-200/50 border-2 border-base-300 hover:border-primary hover:bg-base-200 transition-all duration-300 shadow-xl group cursor-pointer"
            >
              <div className="card-body items-center text-center py-10 sm:py-16 gap-4 sm:gap-6">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-base-300 flex items-center justify-center group-hover:scale-105 sm:group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-300">
                  <Monitor className="w-10 h-10 sm:w-12 sm:h-12 text-base-content/70 group-hover:text-primary" />
                </div>
                <div className="space-y-2 sm:space-y-4">
                  <h2 className="text-2xl sm:text-3xl font-bold">Host (Desktop)</h2>
                  <p className="text-sm sm:text-base text-base-content/60 leading-relaxed max-w-xs mx-auto">
                    Share your Calibre library with other devices on your local network.
                  </p>
                </div>
                <div className="btn btn-primary mt-2 sm:mt-4 px-8 sm:px-12 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity btn-sm sm:btn-md">
                  Select Role
                </div>
              </div>
            </button>

            {/* Client Card */}
            <button
              type="button"
              onClick={() => onSelect("client")}
              className="card bg-base-200/50 border-2 border-base-300 hover:border-success hover:bg-base-200 transition-all duration-300 shadow-xl group cursor-pointer"
            >
              <div className="card-body items-center text-center py-10 sm:py-16 gap-4 sm:gap-6">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-base-300 flex items-center justify-center group-hover:scale-105 sm:group-hover:scale-110 group-hover:bg-success/10 transition-all duration-300">
                  <Smartphone className="w-10 h-10 sm:w-12 sm:h-12 text-base-content/70 group-hover:text-success" />
                </div>
                <div className="space-y-2 sm:space-y-4">
                  <h2 className="text-2xl sm:text-3xl font-bold">Client (Mobile)</h2>
                  <p className="text-sm sm:text-base text-base-content/60 leading-relaxed max-w-xs mx-auto">
                    Sync and download books from an active ShelfSync host.
                  </p>
                </div>
                <div className="btn btn-success mt-2 sm:mt-4 px-8 sm:px-12 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity btn-sm sm:btn-md">
                  Select Role
                </div>
              </div>
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
