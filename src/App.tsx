import { ArrowLeft } from "lucide-react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { lazy, Suspense, useEffect, useState } from "react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { PinModal } from "@/components/ui/PinModal";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { RoleSelection } from "@/features/role-selection/RoleSelection";
import { useUpdater } from "@/hooks/useUpdater";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { useDiscoveryStore } from "@/store/discoveryStore";
import { useLibraryStore } from "@/store/libraryStore";

const ClientDashboard = lazy(() =>
  import("@/features/client/ClientDashboard").then((m) => ({ default: m.ClientDashboard })),
);
const HostDashboard = lazy(() =>
  import("@/features/host/HostDashboard").then((m) => ({ default: m.HostDashboard })),
);
const OpdsCatalogScreenContainer = lazy(() => import("@/features/opds/OpdsCatalogScreenContainer"));

function InitializingView() {
  return (
    <div
      className="h-screen w-screen flex items-center justify-center bg-base-100"
      style={{
        paddingTop: "var(--safe-area-top, 0px)",
        paddingBottom: "var(--safe-area-bottom, 0px)",
      }}
    >
      <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/20 rounded-3xl blur-xl animate-pulse" />
          <BrandLogo size="lg" className="relative shadow-xl rounded-3xl" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="loading loading-spinner loading-md text-primary opacity-80" />
          <p className="text-sm font-medium text-base-content/60 tracking-wide uppercase">
            Initializing ShelfSync
          </p>
        </div>
      </div>
    </div>
  );
}

function useAppContentState() {
  const role = useAppStore((state) => state.role);
  const setRole = useAppStore((state) => state.setRole);

  const { setAppMode, loadSettings } = useLibraryStore();
  const { disconnect, loadTokens } = useAuthStore();

  const myConnectionInfo = useDiscoveryStore((s) => s.myConnectionInfo);
  const initDiscovery = useDiscoveryStore((s) => s.init);

  const [appLoading, setAppLoading] = useState(true);
  const { checkForUpdates } = useUpdater();

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadSettings(), loadTokens()]);
      setTimeout(() => setAppLoading(false), 500);
      checkForUpdates(false);
    };
    init();
  }, [loadSettings, loadTokens, checkForUpdates]);

  useEffect(() => {
    const cleanup = initDiscovery();
    return cleanup;
  }, [initDiscovery]);

  const handleRoleSelect = async (selectedRole: "host" | "client") => {
    setRole(selectedRole);
    await setAppMode(selectedRole);
  };

  const handleChangeRole = async () => {
    await setAppMode("unselected");
    if (role === "client") {
      disconnect();
    }
    setRole("unselected");
  };

  return { role, appLoading, myConnectionInfo, handleRoleSelect, handleChangeRole };
}

function AppContent() {
  const { role, appLoading, myConnectionInfo, handleRoleSelect, handleChangeRole } =
    useAppContentState();

  const { authRequired, pairingHost, pair, disconnect } = useAuthStore();

  const [opdsMode, setOpdsMode] = useState(false);

  if (appLoading) return <InitializingView />;

  if (authRequired) {
    return (
      <PinModal
        hostName={pairingHost?.hostname || "Unknown Host"}
        onPair={pair}
        onCancel={disconnect}
        loading={false}
      />
    );
  }

  if (opdsMode) {
    return (
      <div className="h-screen w-screen flex flex-col bg-base-100 font-sans">
        <header
          className="flex items-center gap-3 px-3 sm:px-6 py-2 border-b border-base-content/10 bg-base-100"
          style={{ paddingTop: "calc(var(--safe-area-top, 0px) + 0.5rem)" }}
        >
          <button type="button" onClick={() => setOpdsMode(false)} className="btn btn-ghost btn-sm">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Back
          </button>
          <span className="text-lg sm:text-xl font-display font-bold tracking-tight">
            Browse Catalog (OPDS)
          </span>
        </header>
        <main id="main-content" className="flex-grow overflow-y-auto p-4 sm:p-6">
          <div className="container max-w-4xl mx-auto">
            <Suspense fallback={<InitializingView />}>
              <OpdsCatalogScreenContainer />
            </Suspense>
          </div>
        </main>
      </div>
    );
  }

  if (role === "unselected") {
    return <RoleSelection onSelect={handleRoleSelect} onBrowseCatalog={() => setOpdsMode(true)} />;
  }

  if (role === "host") {
    return (
      <Suspense fallback={<InitializingView />}>
        <HostDashboard connectionInfo={myConnectionInfo} onChangeRole={handleChangeRole} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<InitializingView />}>
      <ClientDashboard onChangeRole={handleChangeRole} />
    </Suspense>
  );
}

function App() {
  const eInkMode = useLibraryStore((state) => state.eInkMode);
  return (
    <ErrorBoundary>
      <LazyMotion features={domAnimation}>
        <MotionConfig reducedMotion={eInkMode ? "always" : "user"}>
          <AppContent />
          <ToastContainer />
        </MotionConfig>
      </LazyMotion>
    </ErrorBoundary>
  );
}

export default App;
