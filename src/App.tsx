import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { lazy, Suspense, useEffect, useState } from "react";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { StorageChoiceModal } from "@/components/ui/StorageChoiceModal";
import { ToastContainer } from "@/components/ui/ToastContainer";
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
    <main id="main-content" className="h-screen w-screen flex flex-col bg-base-100 font-sans">
      <Suspense fallback={<InitializingView />}>
        <OpdsCatalogScreenContainer />
      </Suspense>
    </main>
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
