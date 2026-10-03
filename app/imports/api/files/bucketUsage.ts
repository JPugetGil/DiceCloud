/** Where the app puts the uploaded files (images and character archives) in the bucket */
export const APP_FILES_PREFIX = 'files/';

export type PrefixUsage = {
  // The first folder of the objects' keys with its slash, '' for the bucket's root
  prefix: string,
  bytes: number,
  objectCount: number,
};

/** The folder at the start of an object's key, with its slash, '' at the bucket's root */
export function getTopLevelPrefix(key: string): string {
  const slash = key.indexOf('/');
  return slash === -1 ? '' : key.slice(0, slash + 1);
}

/** Adds an object to the usage of its top-level folder */
export function addObjectToUsage(
  usage: Map<string, PrefixUsage>, key: string, size: number
): void {
  const prefix = getTopLevelPrefix(key);
  const entry = usage.get(prefix) ?? { prefix, bytes: 0, objectCount: 0 };
  entry.bytes += size;
  entry.objectCount += 1;
  usage.set(prefix, entry);
}

/** The folders, largest first, and their total */
export function summarizeUsage(prefixes: Iterable<PrefixUsage>) {
  const sorted = [...prefixes].sort((a, b) => b.bytes - a.bytes || a.prefix.localeCompare(b.prefix));
  return {
    prefixes: sorted,
    bytes: sorted.reduce((sum, { bytes }) => sum + bytes, 0),
    objectCount: sorted.reduce((sum, { objectCount }) => sum + objectCount, 0),
  };
}
