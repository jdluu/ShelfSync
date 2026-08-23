import type { Catalog, FetchOpdsCatalogParams } from "@/types/opds";
import { safeInvoke } from "@/utils/tauri";

export const opdsClient = {
  fetchCatalog: (params: FetchOpdsCatalogParams) => {
    return safeInvoke<Catalog>("fetch_opds_catalog", {
      url: params.url,
      username: params.username,
      password: params.password,
      page: params.page ?? undefined,
      page_size: params.page_size ?? undefined,
    });
  },
};
