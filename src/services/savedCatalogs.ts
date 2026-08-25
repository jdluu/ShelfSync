import { safeInvoke } from "@/utils/tauri";

export interface SavedCatalog {
  id: string;
  name: string;
  url: string;
  username: string;
  added_at: string;
}

export const savedCatalogsService = {
  list: (): Promise<SavedCatalog[]> => {
    return safeInvoke<SavedCatalog[]>("opds_list_saved_catalogs", {}, []);
  },

  save: (name: string, url: string, username: string): Promise<SavedCatalog> => {
    return safeInvoke<SavedCatalog>("opds_save_catalog", { name, url, username });
  },

  delete: (id: string): Promise<boolean> => {
    return safeInvoke<boolean>("opds_delete_catalog", { id }, false);
  },
};
