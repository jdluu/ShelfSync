export interface Book {
    id: number;
    title: string;
    authors: string;
    path: string;       // Relative path on Host (Calibre structure)
    cover_url?: string; // Constructed URL (optional)
    
    // Client-side only extensions
    local_path?: string; 
    remote_id?: number; 
    format?: string;
}

export interface ConnectionInfo {
    ip: string;
    port: number;
    hostname: string;
}