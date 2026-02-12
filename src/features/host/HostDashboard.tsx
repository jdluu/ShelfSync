import { ChevronsUpDown, Folder, Monitor, Network } from "lucide-react";
import type React from "react";
import QRCode from "react-qr-code";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SkipLink } from "@/components/SkipLink";
import type { Book, ConnectionInfo } from "@/types/core";

interface HostDashboardProps {
  books: Book[];
  loading: boolean;
  error: string | null;
  libraryPath: string;
  connectionInfo: ConnectionInfo | null;
  onSelectFolder: () => void;
  onChangeRole: () => void;
}

export const HostDashboard: React.FC<HostDashboardProps> = ({
  books,
  loading,
  error,
  libraryPath,
  connectionInfo,
  onSelectFolder,
  onChangeRole,
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-base-100 font-sans selection:bg-primary/30">
      <SkipLink />

      <Header title="Host Dashboard" onChangeRole={onChangeRole} />

      {/* Main Content */}
      <main id="main-content" className="flex-grow p-4 sm:p-8 flex items-start justify-center">
        <div className="container max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {/* Library Selection Card */}
            <div className="card bg-base-100 border border-base-300 shadow-sm overflow-hidden flex flex-col items-center justify-center p-12 text-center gap-8 relative overflow-hidden group">
              {loading && (
                <div className="absolute inset-0 bg-base-200/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                  <span className="loading loading-spinner loading-lg text-primary"></span>
                </div>
              )}

              <div className="relative">
                <div className="w-32 h-32 rounded-3xl bg-base-300 flex items-center justify-center group-hover:bg-primary/5 transition-all duration-300">
                  <Folder className="w-16 h-16 text-base-content/40 group-hover:text-primary/70 transition-colors" />
                </div>
              </div>

              <div className="space-y-6 w-full max-w-sm">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={onSelectFolder}
                    className="btn btn-primary btn-lg w-full shadow-lg group active:scale-95 transition-transform"
                    disabled={loading}
                  >
                    {libraryPath ? "Select Library" : "Select Library"}
                  </button>
                  {error && (
                    <p className="text-error text-xs font-semibold animate-pulse">{error}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-base-content/40 font-medium text-xs uppercase tracking-wider">
                    {libraryPath ? "No library selected." : "No library selected."}
                  </p>
                  <p className="text-sm text-base-content/60 px-4 line-clamp-2 break-all font-mono">
                    {libraryPath || "Choose your Calibre library folder to begin."}
                  </p>
                  {books.length > 0 && (
                    <p className="text-[10px] text-success font-bold uppercase tracking-widest mt-2">
                      {books.length} Books Found
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Connectivity Section */}
            <div className="card bg-base-200/40 border border-base-300 shadow-xl overflow-hidden flex flex-col">
              <div className="p-6 border-b border-base-300 flex items-center gap-3 bg-base-200/20">
                <Network className="w-6 h-6 text-primary" />
                <h2 className="text-xl font-bold tracking-tight">Connectivity</h2>
              </div>

              <div className="card-body p-8 flex flex-col justify-between gap-8 h-full">
                {connectionInfo ? (
                  <>
                    {/* QR Code */}
                    <div className="flex justify-center grow items-center">
                      <div className="bg-white p-6 rounded-2xl shadow-xl ring-1 ring-black/5">
                        <QRCode
                          value={JSON.stringify(connectionInfo)}
                          size={220}
                          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                          viewBox={`0 0 256 256`}
                        />
                      </div>
                    </div>

                    {/* Network Info Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-auto">
                      <div className="bg-base-300/30 p-4 rounded-xl border border-base-300 flex items-center justify-between group hover:bg-base-300/50 transition-colors">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider">
                            Host IP
                          </p>
                          <p className="text-xl font-bold font-mono text-base-content/90 tracking-tight">
                            {connectionInfo.ip}
                          </p>
                        </div>
                        <Monitor className="w-6 h-6 text-base-content/20 group-hover:text-primary/40 transition-colors" />
                      </div>

                      <div className="bg-base-300/30 p-4 rounded-xl border border-base-300 flex items-center justify-between group hover:bg-base-300/50 transition-colors">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider">
                            Port
                          </p>
                          <p className="text-xl font-bold font-mono text-base-content/90 tracking-tight">
                            {connectionInfo.port}
                          </p>
                        </div>
                        <ChevronsUpDown className="w-6 h-6 text-base-content/20 group-hover:text-primary/40 transition-colors" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 gap-4 grow">
                    <span className="loading loading-ring loading-lg text-primary"></span>
                    <p className="text-base-content/40 font-medium">Initializing network...</p>
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
