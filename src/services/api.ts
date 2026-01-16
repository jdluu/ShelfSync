import { invoke } from "@tauri-apps/api/core";
import { Book, ConnectionInfo } from "../types";

export const api = {
    library: {
        getBooks: (libraryPath: string) => 
            invoke<Book[]>("get_books", { libraryPath }),
        
        setLibraryPath: (path: string) => 
            invoke<void>("set_library_path", { path }),
    },
    network: {
        getConnectionInfo: () => 
            invoke<ConnectionInfo>("get_connection_info"),
            
        discoverHosts: () => 
            invoke<ConnectionInfo[]>("discover_hosts"),
    }
};
