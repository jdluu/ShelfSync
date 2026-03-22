import { ChevronsUpDown, Folder, Monitor, Network } from "lucide-react";
import type React from "react";
import QRCodeDefault from "react-qr-code";

// ESM / CJS interop for React-QR-Code
const QRCode = (QRCodeDefault as { default?: typeof QRCodeDefault })?.default ?? QRCodeDefault;

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { SkipLink } from "@/components/layout/SkipLink";
import { useLocalLibrary } from "@/hooks/useLibraryQuery";
import { useLibraryStore } from "@/store/libraryStore";
import type { ConnectionInfo } from "@/types/core";

interface HostDashboardProps {
  connectionInfo: ConnectionInfo | null;
  onChangeRole: () => void;
}

export const HostDashboard: React.FC<HostDashboardProps> = ({ connectionInfo, onChangeRole }) => {
  const { libraryPath, selectLibraryFolder } = useLibraryStore();
  const localQuery = useLocalLibrary(libraryPath);

  const loading = localQuery.isLoading;
  const error = localQuery.error?.message;
  const books = localQuery.data || [];

  return (
    <div className="min-h-screen flex flex-col bg-base-100 font-sans selection:bg-primary/30">
      <SkipLink />

      <Header title="Host Dashboard" onChangeRole={onChangeRole} />

      {/* Main Content */}
      <main id="main-content" className="flex-grow p-4 sm:p-8 flex items-start justify-center">
        <div className="container max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {/* Library Selection Card */}
            <div className="card bg-base-100 hover:bg-base-200/50 transition-all duration-300 border border-base-content/10 shadow-sm hover:shadow-xl flex flex-col items-center justify-center p-8 sm:p-12 text-center gap-6 sm:gap-8 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

              {loading && (
                <div className="absolute inset-0 bg-base-200/60 backdrop-blur-[2px] z-20 flex items-center justify-center">
                  <span className="loading loading-spinner loading-lg text-primary"></span>
                </div>
              )}

              <div className="relative z-10 mt-4">
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-[2rem] bg-base-200/80 flex items-center justify-center group-hover:scale-[1.08] group-hover:bg-primary/10 transition-all duration-300 ring-1 ring-base-content/5 group-hover:ring-primary/20">
                  <Folder className="w-12 h-12 sm:w-16 sm:h-16 text-base-content/50 group-hover:text-primary transition-colors duration-300" />
                </div>
              </div>

              <div className="space-y-6 w-full max-w-sm relative z-10">
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={selectLibraryFolder}
                    className="btn btn-primary btn-lg w-full shadow-sm hover:shadow-md group active:scale-95 transition-all outline-none"
                    disabled={loading}
                  >
                    {libraryPath ? "Update Library" : "Select Library"}
                  </button>
                  <div className="flex items-center justify-center gap-2">
                    <p className="text-error text-xs font-semibold animate-pulse">{error}</p>
                  </div>
                </div>

                <div className="space-y-2 bg-base-200/30 p-4 rounded-2xl border border-base-content/5">
                  <p className="text-base-content/50 font-bold text-[10px] uppercase tracking-wider">
                    {libraryPath ? "Library Active" : "No library selected"}
                  </p>
                  <p className="text-sm text-base-content/80 px-2 line-clamp-2 break-all font-mono font-medium">
                    {libraryPath || "Choose your Calibre library folder to begin hosting."}
                  </p>
                  {books.length > 0 && (
                    <div className="inline-flex mt-3 px-3 py-1 bg-success/10 text-success rounded-full text-[10px] font-bold uppercase tracking-widest border border-success/20">
                      {books.length} Books Found
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Connectivity Section */}
            <div className="card bg-base-100 border border-base-content/10 shadow-sm flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

              <div className="p-5 sm:p-6 border-b border-base-content/5 flex items-center gap-3 relative z-10">
                <div className="p-2 bg-primary/10 rounded-xl">
                  <Network className="w-5 h-5 text-primary" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-xl font-display font-bold tracking-tight">Connectivity</h2>
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex h-2 w-2">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                       <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                    </div>
                    <span className="text-[10px] font-bold text-success uppercase tracking-widest">Discovery Active</span>
                  </div>
                </div>
              </div>

              <div className="card-body p-5 sm:p-8 flex flex-col gap-6 h-full relative z-10">
                {connectionInfo ? (
                  <>
                    {/* QR Code Container - Constrained size */}
                    <div className="flex justify-center items-center">
                      <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-lg ring-1 ring-black/5 hover:scale-[1.02] transition-transform duration-300">
                        <QRCode
                          value={JSON.stringify(connectionInfo)}
                          size={160}
                          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                          viewBox={`0 0 256 256`}
                        />
                      </div>
                    </div>

                    {/* Network Info Grid */}
                    <div className="grid grid-cols-2 gap-3 mt-auto">
                      <div className="bg-base-200/50 p-4 rounded-2xl border border-base-content/5 flex items-center justify-between hover:bg-base-200 transition-colors">
                        <div className="space-y-1 overflow-hidden">
                          <p className="text-[10px] font-bold text-base-content/50 uppercase tracking-wider">
                            Host IP
                          </p>
                          <p className="text-sm sm:text-base font-bold font-mono text-base-content/90 tracking-tight truncate">
                            {connectionInfo.ip}
                          </p>
                        </div>
                        <Monitor className="w-5 h-5 text-base-content/20 shrink-0 ml-2" />
                      </div>

                      <div className="bg-base-200/50 p-4 rounded-2xl border border-base-content/5 flex items-center justify-between hover:bg-base-200 transition-colors">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-base-content/50 uppercase tracking-wider">
                            Port
                          </p>
                          <p className="text-sm sm:text-base font-bold font-mono text-base-content/90 tracking-tight">
                            {connectionInfo.port}
                          </p>
                        </div>
                        <ChevronsUpDown className="w-5 h-5 text-base-content/20 shrink-0 ml-2" />
                      </div>
                    </div>

                    {connectionInfo.pin && (
                      <div className="bg-base-200/50 p-4 rounded-2xl border border-base-content/5 flex flex-col items-center gap-1 mt-2">
                        <p className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest">
                          Pairing PIN
                        </p>
                        <p className="text-3xl font-display font-black tracking-[0.3em] text-primary ml-[0.3em]">
                          {connectionInfo.pin}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 sm:py-20 gap-4 grow">
                    <span className="loading loading-ring loading-lg text-primary"></span>
                    <p className="text-base-content/50 font-medium">Initializing network...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};
