import { RoleSelection } from "@/features/RoleSelection";
import { HostDashboard } from "@/features/host/HostDashboard";
import { ClientDashboard } from "@/features/client/ClientDashboard";
import { DiscoveryProvider, useDiscovery } from "@/context/DiscoveryContext";
import { LibraryProvider, useLibrary } from "@/context/LibraryContext";
import { PinModal } from "@/components/PinModal";

function AppContent() {
  const { 
    appMode, 
    setAppMode, 
    books, 
    localBooks, 
    loading, 
    error,
    libraryPath, 
    connectedHost, 
    connectToHost, 
    disconnect, 
    syncBook, 
    selectLibraryFolder, 
    openLocalBook,
    toggleReadStatus,
    pairingHost,
    authRequired,
    pair
  } = useLibrary();

  const { myConnectionInfo } = useDiscovery();

  if (authRequired) {
    return (
      <PinModal
        hostName={pairingHost?.hostname || "Unknown Host"}
        onPair={pair}
        onCancel={disconnect}
        loading={loading}
      />
    );
  }

  if (appMode === "unselected") {
    return <RoleSelection onSelect={setAppMode} />;
  }

  if (appMode === "client") {
    return (
      <ClientDashboard 
        books={books}
        localBooks={localBooks}
        loading={loading}
        error={error}
        connectedHost={connectedHost}
        onConnect={connectToHost}
        onDisconnect={disconnect}
        onSync={syncBook}
        onOpenBook={openLocalBook}
        onToggleStatus={toggleReadStatus}
        onChangeRole={() => setAppMode("unselected")}
      />
    );
  }

  // Host Mode
  return (
    <HostDashboard 
        books={books}
        loading={loading}
        error={error}
        libraryPath={libraryPath}
        connectionInfo={myConnectionInfo}
        onSelectFolder={selectLibraryFolder}
        onChangeRole={() => setAppMode("unselected")}
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
