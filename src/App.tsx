import { lazy, Suspense, useEffect, useState } from "react";
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

function InitializingView() {
  return (
    <div
      className="h-screen w-screen flex items-center justify-center bg-base-100"
      style={{
        paddingTop: "var(--safe-area-top, 0px)",
        paddingBottom: "var(--safe-area-bottom, 0px)",
      }}
    >
      <div className="flex flex-col items-center gap-4">
        <span className="loading loading-spinner loading-xl text-primary"></span>
        <p className="text-lg font-medium text-base-content/70">Initializing ShelfSync...</p>
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

  if (role === "unselected") {
    return <RoleSelection onSelect={handleRoleSelect} />;
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
  return (
    <>
      <AppContent />
      <ToastContainer />
    </>
  );
}

export default App;
