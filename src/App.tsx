import { useEffect, useState } from "react";
import { PinModal } from "@/components/PinModal";
import { DiscoveryProvider, useDiscovery } from "@/context/DiscoveryContext";
import { LibraryProvider, useLibrary } from "@/context/LibraryContext";
import { ClientDashboard } from "@/features/client/ClientDashboard";
import { HostDashboard } from "@/features/host/HostDashboard";
import { RoleSelection } from "@/features/RoleSelection";

function AppContent() {
  const [role, setRole] = useState<"host" | "client" | null>(null);
  const {
    books,
    localBooks,
    loading: libraryLoading,
    error: libraryError,
    libraryPath,
    selectLibraryFolder,
    syncBook,
    toggleReadStatus,
    openLocalBook,
    authRequired,
    pairingHost,
    pair,
    connectedHost,
    connectToHost,
    disconnect,
    setAppMode,
  } = useLibrary();

  const {
    myConnectionInfo,
    // error: connectionError, // Discovery doesn't expose error
  } = useDiscovery();

  const [appLoading, setAppLoading] = useState(true);

  useEffect(() => {
    // Check if we have a stored role or library path
    const init = async () => {
      // Small delay for smooth startup
      setTimeout(() => setAppLoading(false), 500);
    };
    init();
  }, []);

  const handleRoleSelect = async (selectedRole: "host" | "client") => {
    setRole(selectedRole);
    if (selectedRole === "host") {
      await setAppMode("host");
    } else {
      await setAppMode("client");
    }
  };

  const handleChangeRole = async () => {
    await setAppMode("unselected");
    if (role === "client") {
      disconnect();
    }
    setRole(null);
  };

  if (appLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-base-100">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-xl text-primary"></span>
          <p className="text-lg font-medium text-base-content/60">Initializing ShelfSync...</p>
        </div>
      </div>
    );
  }

  if (authRequired) {
    return (
      <PinModal
        hostName={pairingHost?.hostname || "Unknown Host"}
        onPair={pair}
        onCancel={disconnect}
        loading={libraryLoading}
      />
    );
  }

  if (!role) {
    return <RoleSelection onSelect={handleRoleSelect} />;
  }

  if (role === "host") {
    return (
      <HostDashboard
        books={books}
        loading={libraryLoading}
        error={libraryError}
        libraryPath={libraryPath}
        connectionInfo={myConnectionInfo}
        onSelectFolder={selectLibraryFolder}
        onChangeRole={handleChangeRole}
      />
    );
  }

  return (
    <ClientDashboard
      books={books}
      localBooks={localBooks}
      loading={libraryLoading}
      error={libraryError}
      connectedHost={connectedHost}
      onConnect={connectToHost}
      onDisconnect={disconnect}
      onSync={syncBook}
      onOpenBook={openLocalBook}
      onToggleStatus={toggleReadStatus}
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
