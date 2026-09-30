/**
 * Async compatible map that processes all items in series
 */
export async function serialMap(array: any[], fn: (doc: any) => Promise<any>): Promise<any[]> {
  const results: any[] = [];
  for (const doc of array) {
    const result = await fn(doc);
    results.push(result);
  }
  return results;
}

