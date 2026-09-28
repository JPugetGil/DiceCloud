export default async function batchInsertAsync(collection, documents) {
  const insertedIds = [];
  for (const document of documents) {
    insertedIds.push(await collection.insertAsync(document));
  }
  return insertedIds;
}