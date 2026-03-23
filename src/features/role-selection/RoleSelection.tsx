import { Search, Share2 } from "lucide-react";
import type React from "react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { BrandLogo } from "@/components/ui/BrandLogo";

interface RoleSelectionProps {
  onSelect: (role: "host" | "client") => void;
}

export const RoleSelection: React.FC<RoleSelectionProps> = ({ onSelect }) => {
  return (
    <div className="min-h-screen flex flex-col bg-base-100 font-sans selection:bg-primary/30">
      <SkipLink />

      <div className="flex justify-center pt-12 sm:pt-16">
        <div className="flex flex-col items-center gap-4">
          <BrandLogo size="xl" className="shadow-2xl rounded-3xl" />
          <h1 className="text-4xl font-display font-black tracking-tighter">ShelfSync</h1>
        </div>
      </div>

      <Header title="Choose Your Role" />

      {/* Main Content */}
      <main id="main-content" className="flex-grow flex flex-col p-4 sm:p-6 pt-8 sm:pt-12">
        <div className="container max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10">
            {/* Host Card */}
            <button
              type="button"
              onClick={() => onSelect("host")}
              className="card bg-base-100 hover:bg-base-200/50 border border-base-content/10 hover:border-primary/50 transition-all duration-300 shadow-sm hover:shadow-xl group cursor-pointer relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="card-body items-center text-center py-10 sm:py-16 gap-4 sm:gap-6 relative z-10">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[2rem] bg-base-200/80 flex items-center justify-center group-hover:scale-[1.08] group-hover:bg-primary/10 transition-all duration-300 ring-1 ring-base-content/5 group-hover:ring-primary/20">
                  <Share2 className="w-10 h-10 sm:w-12 sm:h-12 text-base-content/60 group-hover:text-primary transition-colors duration-300" />
                </div>
                <div className="space-y-3 sm:space-y-4">
                  <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
                    Host Mode
                  </h2>
                  <p className="text-sm sm:text-base text-base-content/60 leading-relaxed max-w-xs mx-auto">
                    Share your library with other devices on your local network.
                  </p>
                </div>
                <div className="btn btn-primary mt-2 sm:mt-4 px-8 sm:px-12 transition-all btn-sm sm:btn-md shadow-sm group-hover:shadow-md group-active:scale-95">
                  Select Role
                </div>
              </div>
            </button>

            {/* Client Card */}
            <button
              type="button"
              onClick={() => onSelect("client")}
              className="card bg-base-100 hover:bg-base-200/50 border border-base-content/10 hover:border-success/50 transition-all duration-300 shadow-sm hover:shadow-xl group cursor-pointer relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-success/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="card-body items-center text-center py-10 sm:py-16 gap-4 sm:gap-6 relative z-10">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[2rem] bg-base-200/80 flex items-center justify-center group-hover:scale-[1.08] group-hover:bg-success/10 transition-all duration-300 ring-1 ring-base-content/5 group-hover:ring-success/20">
                  <Search className="w-10 h-10 sm:w-12 sm:h-12 text-base-content/60 group-hover:text-success transition-colors duration-300" />
                </div>
                <div className="space-y-3 sm:space-y-4">
                  <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">
                    Client Mode
                  </h2>
                  <p className="text-sm sm:text-base text-base-content/60 leading-relaxed max-w-xs mx-auto">
                    Access and sync books from an active ShelfSync host.
                  </p>
                </div>
                <div className="btn btn-success mt-2 sm:mt-4 px-8 sm:px-12 transition-all btn-sm sm:btn-md shadow-sm group-hover:shadow-md group-active:scale-95 font-medium">
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
