export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  key: string;
  checksum?: string; // SHA-256 hash for data integrity validation
}

export interface CacheConfig {
  tasks: { ttl: number };
  projects: { ttl: number };
  folders: { ttl: number };
  analytics: { ttl: number };
  tags: { ttl: number };
  reviews: { ttl: number };
}

export type CacheCategory = keyof CacheConfig;

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  checksumFailures: number; // Count of checksum validation failures
}
