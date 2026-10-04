import SCHEMA_VERSION from '/imports/constants/SCHEMA_VERSION';
import { LIBRARY_FILE_TYPE } from '/imports/api/library/methods/libraryFiles';

/*
 * Library files in the browser: saved compressed when the browser can, read
 * whether they are compressed or not. See libraryFiles.js for their content.
 */

async function gzip(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

async function gunzip(file) {
  const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

function safeFileName(name) {
  return (name || 'library').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'library';
}

/** Saves a library, or a collection's libraries, as a file */
export async function downloadLibraryFile({ name, collection, libraries }) {
  const text = JSON.stringify({
    meta: { type: LIBRARY_FILE_TYPE, schemaVersion: SCHEMA_VERSION, exportDate: new Date() },
    ...collection && { collection },
    libraries,
  });
  const compressed = typeof CompressionStream === 'function';
  const blob = compressed ? await gzip(text) : new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeFileName(name)}.dicecloud.json${compressed ? '.gz' : ''}`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The collection and libraries of a file: one saved here, or the
 * [{ library, nodes }] of tools/libraryImport. Throws if it is neither.
 */
export async function readLibraryFile(file) {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const isGzip = head[0] === 0x1f && head[1] === 0x8b;
  const text = isGzip ? await gunzip(file) : await file.text();
  const data = JSON.parse(text);
  const libraries = Array.isArray(data) ? data : data?.libraries;
  if (!Array.isArray(libraries) || !libraries.length
    || !libraries.every(entry => entry?.library?._id && Array.isArray(entry.nodes))) {
    throw new Error('not-a-library-file');
  }
  return { collection: Array.isArray(data) ? undefined : data.collection, libraries };
}
