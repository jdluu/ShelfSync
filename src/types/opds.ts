export interface NavigationLink {
  href: string;
  rel?: string | null;
  title?: string | null;
  type?: string | null;
}

export interface Series {
  name: string;
  index?: number | null;
}

export interface Relation {
  rel: string;
  href: string;
}

export interface AcquisitionCost {
  price?: number | null;
  currency?: string | null;
  description?: string | null;
}

export interface Acquisition {
  href: string;
  type?: string | null;
  media_type?: string | null;
  cost?: AcquisitionCost | null;
  rel?: string | null;
}

export interface RepresentativeLink {
  href: string;
  type?: string | null;
}

export interface Publication {
  id: string;
  updated?: string | null;
  title: string;
  authors: string[];
  pubdate?: string | null;
  identifiers: Record<string, string>;
  series?: Series | null;
  languages: string[];
  relations: Relation[];
  descriptions: string[];
  links: Acquisition[];
  providers?: string[] | null;
  representative?: RepresentativeLink | null;
}

export interface Pagination {
  page: number;
  size: number;
  total?: number | null;
  next?: string | null;
}

export interface Catalog {
  title: string;
  updated?: string | null;
  authors: string[];
  links: NavigationLink[];
  publications: Publication[];
  pagination?: Pagination | null;
}

export interface FetchOpdsCatalogParams {
  url: string;
  username: string;
  password: string;
  page?: number | null;
  page_size?: number | null;
}
