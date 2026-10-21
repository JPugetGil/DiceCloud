/**
 * The headers a file collection serves its files with: ostrio:files' own,
 * but the Content-Type the collection allows rather than the one the
 * uploading client declared (fileTypes.ts), never sniffed by the browser,
 * and the file sandboxed should a browser open it as a page: no script of it
 * runs on the app's origin.
 */
export function fileResponseHeaders(servedType: (storedType?: string) => string) {
  return (responseCode?: string, _fileRef?: unknown, versionRef?: { type?: string, size?: number }) => {
    const headers: Record<string, string> = {};
    // ostrio:files' defaults (FilesCollection's constructor)
    switch (responseCode) {
      case '206':
        headers.Pragma = 'private';
        headers['Transfer-Encoding'] = 'chunked';
        break;
      case '400':
        headers['Cache-Control'] = 'no-cache';
        break;
      case '416':
        headers['Content-Range'] = `bytes */${versionRef?.size}`;
        break;
    }
    headers.Connection = 'keep-alive';
    headers['Content-Type'] = servedType(versionRef?.type);
    headers['Accept-Ranges'] = 'bytes';
    headers['X-Content-Type-Options'] = 'nosniff';
    headers['Content-Security-Policy'] = 'sandbox';
    return headers;
  };
}
