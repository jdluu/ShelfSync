import { useEffect, useState } from "react";
import { PinModal } from "@/components/ui/PinModal";
import { DiscoveryProvider, useDiscovery } from "@/contexts/DiscoveryContext";
import { LibraryProvider, useLibrary } from "@/contexts/LibraryContext";
import { ClientDashboard } from "@/features/client/ClientDashboard";
import { HostDashboard } from "@/features/host/HostDashboard";
import { RoleSelection } from "@/features/role-selection/RoleSelection";
import { useAppStore } from "@/store/appStore";

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
        <p className="text-lg font-medium text-base-content/60">Initializing ShelfSync...</p>
      </div>
    </div>
  );
}

function useAppContentState() {
  const role = useAppStore((state) => state.role);
  const setRole = useAppStore((state) => state.setRole);
  const library = useLibrary();
  const discovery = useDiscovery();
  const [appLoading, setAppLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      setTimeout(() => setAppLoading(false), 500);
    };
    init();
  }, []);

  const handleRoleSelect = async (selectedRole: "host" | "client") => {
    setRole(selectedRole);
    if (selectedRole === "host") {
      await library.setAppMode("host");
    } else {
      await library.setAppMode("client");
    }
  };

  const handleChangeRole = async () => {
    await library.setAppMode("unselected");
    if (role === "client") {
      library.disconnect();
    }
    setRole("unselected");
  };

  return { role, appLoading, library, discovery, handleRoleSelect, handleChangeRole };
}

function AppContent() {
  const { role, appLoading, library, discovery, handleRoleSelect, handleChangeRole } =
    useAppContentState();

  if (appLoading) return <InitializingView />;

  if (library.authRequired) {
    return (
      <PinModal
        hostName={library.pairingHost?.hostname || "Unknown Host"}
        onPair={library.pair}
        onCancel={library.disconnect}
        loading={library.loading}
      />
    );
  }

  if (role === "unselected") {
    return <RoleSelection onSelect={handleRoleSelect} />;
  }

  if (role === "host") {
    return (
      <HostDashboard
        books={library.books}
        loading={library.loading}
        error={library.error}
        libraryPath={library.libraryPath}
        connectionInfo={discovery.myConnectionInfo}
        onSelectFolder={library.selectLibraryFolder}
        onChangeRole={handleChangeRole}
      />
    );
  }

  return (
    <ClientDashboard
      books={library.books}
      localBooks={library.localBooks}
      loading={library.loading}
      error={library.error}
      connectedHost={library.connectedHost}
      onConnect={library.connectToHost}
      onDisconnect={library.disconnect}
      onSync={library.syncBook}
      onOpenBook={library.openLocalBook}
      onToggleStatus={library.toggleReadStatus}
      onChangeRole={handleChangeRole}
    />
  );
}

function App() {
  return (
    <DiscoveryProvider>
      <LibraryProvider>
        <AppContent />
      </LibraryProvider>
    </DiscoveryProvider>
  );
}

export default App;
