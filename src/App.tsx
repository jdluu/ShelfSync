import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { lazy, Suspense, useEffect, useState } from "react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { StorageChoiceModal } from "@/components/ui/StorageChoiceModal";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { Header } from "@/components/layout/Header";
import { useUpdater } from "@/hooks/useUpdater";
import { useLibraryStore } from "@/store/libraryStore";

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
        <BrandLogo size="xl" />
        <div className="flex flex-col items-center gap-2">
          <span className="loading loading-spinner loading-sm text-primary" />
          <p className="text-xs font-medium text-base-content/50 tracking-widest uppercase">
            Opening your shelf
          </p>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const loadSettings = useLibraryStore((state) => state.loadSettings);
  const { checkForUpdates } = useUpdater();

  const [appLoading, setAppLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      await loadSettings();
      setTimeout(() => setAppLoading(false), 500);
      checkForUpdates(false);
    };
    init();
  }, [loadSettings, checkForUpdates]);

  if (appLoading) return <InitializingView />;

  return (
    <div className="h-screen w-screen flex flex-col bg-base-100 font-sans">
      <Header title="OPDS Catalog" />
      <main id="main-content" className="flex-1 overflow-y-auto">
        <Suspense fallback={<InitializingView />}>
          <OpdsCatalogScreenContainer />
        </Suspense>
      </main>
    </div>
  );
}

function App() {
  const eInkMode = useLibraryStore((state) => state.eInkMode);
  return (
    <ErrorBoundary>
      <LazyMotion features={domAnimation}>
        <MotionConfig reducedMotion={eInkMode ? "always" : "user"}>
          <AppContent />
          <StorageChoiceModal />
          <ToastContainer />
        </MotionConfig>
      </LazyMotion>
    </ErrorBoundary>
  );
}

export default App;
