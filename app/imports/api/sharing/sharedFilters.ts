/*
 * The selectors of the documents a user may see, by their sharing fields
 * (SharingSchema): written once, here, rather than in each publication,
 * method and page that lists them, where a copy could miss a branch. Pure, and
 * importing nothing: the client's pages use them as the server does.
 */

/** The branches of the documents shared with the user: owned, writable or readable */
export function sharedWith(userId: string) {
  return [{ owner: userId }, { writers: userId }, { readers: userId }];
}

/**
 * The documents the user may read: shared with them, or public; only the
 * public ones among `publicIds` when given (the libraries a user follows).
 * Signed out, the public ones alone: the copies this replaces matched
 * `{ writers: null }`, which a document without the field matches too
 */
export function readableBy(userId: string | null | undefined, publicIds?: string[]) {
  return {
    $or: [
      ...userId ? sharedWith(userId) : [],
      publicIds ? { _id: { $in: publicIds }, public: true } : { public: true },
    ],
  };
}
