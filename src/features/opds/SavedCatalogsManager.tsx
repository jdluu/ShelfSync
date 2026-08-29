import { BookMarked, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { type SavedCatalog, savedCatalogsService } from "@/services/savedCatalogs";

interface SavedCatalogsManagerProps {
  onConnectTo: (catalog: SavedCatalog) => void;
  refreshKey?: number;
}

export const SavedCatalogsManager: React.FC<SavedCatalogsManagerProps> = ({
  onConnectTo,
  refreshKey = 0,
}) => {
  const [catalogs, setCatalogs] = useState<SavedCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a reload trigger, not a value dependency
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const list = await savedCatalogsService.list();
        if (!cancelled) setCatalogs(list);
      } catch {
        if (!cancelled) setCatalogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const load = useCallback(async () => {
    try {
      setCatalogs(await savedCatalogsService.list());
    } catch {
      setCatalogs([]);
    }
  }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await savedCatalogsService.delete(id);
      await load();
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && catalogs.length === 0 && refreshKey === 0) {
    return (
      <div className="text-center text-sm text-base-content/50 py-4">Loading saved catalogs…</div>
    );
  }

  if (catalogs.length === 0) {
    return null;
  }

  return (
    <section aria-label="Saved catalogs" className="w-full max-w-xl mx-auto">
      <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
        <BookMarked className="w-4 h-4" aria-hidden="true" />
        Your catalogs ({catalogs.length})
      </h3>
      <ul className="flex flex-col gap-2 list-none p-0">
        {catalogs.map((catalog) => (
          <li key={catalog.id} className="card bg-base-200 border border-base-300 card-compact">
            <div className="card-body flex-row items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{catalog.name}</p>
                <p className="text-xs text-base-content/50 font-mono truncate">{catalog.url}</p>
                {catalog.username && (
                  <p className="text-xs text-base-content/40 truncate">{catalog.username}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="primary"
                  onClick={() => onConnectTo(catalog)}
                  className="btn-xs gap-1"
                  aria-label={`Connect to ${catalog.name}`}
                >
                  <Plus className="w-3 h-3" aria-hidden="true" />
                  Connect
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleDelete(catalog.id)}
                  disabled={deletingId === catalog.id}
                  className="btn-xs btn-square text-error"
                  aria-label={`Remove ${catalog.name} from saved catalogs`}
                >
                  {deletingId === catalog.id ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
