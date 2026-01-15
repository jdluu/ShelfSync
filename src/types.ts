export interface Book {
    id: number;
    title: string;
    authors: string;
    path?: string; // On host
    local_path?: string; // On client
    cover_url?: string;
}
