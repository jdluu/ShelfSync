export interface Book {
    id: number;
    title: string;
    authors: string;
    path: string;       // Relative path on Host (Calibre structure)
    formats?: string[]; // Available formats from Host
    cover_url?: string; // Constructed URL (optional)
    series?: string;
    series_index?: number;
    tags?: string[];
    publisher?: string;
    
    // Client-side only extensions
    local_path?: string; 
    remote_id?: number; 
    format?: string;
    read_status?: 'unread' | 'reading' | 'finished';
}

export interface ConnectionInfo {
    ip: string;
    port: number;
    hostname: string;
    pin?: string;
}