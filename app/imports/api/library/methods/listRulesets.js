import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Libraries from '/imports/api/library/Libraries';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import { RULESET_TAG, guessLanguage, plainSummary } from '/imports/api/library/rulesets';

/**
 * The rulesets a user can start a character from (UX3): the nodes that fill
 * a Ruleset slot in the public libraries and in those the user owns or shares,
 * each with the collection that holds it, if any (the one the user then
 * follows), its summary, its language (set, else guessed), whether the
 * admins recommend it, and whether the user follows it already. Server only: the client lacks the libraries it does not follow.
 */
const listRulesets = new ValidatedMethod({
  name: 'libraries.listRulesets',
  validate: null,
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run() {
    const userId = this.userId;
    if (!userId) throw new Meteor.Error('libraries.listRulesets.denied', 'You need to be logged in');
    if (Meteor.isClient) return [];
    /** @type {any} */
    const user = await Meteor.users.findOneAsync(userId, {
      fields: { subscribedLibraries: 1, subscribedLibraryCollections: 1 },
    });
    const visible = { $or: [{ public: true }, { owner: userId }, { readers: userId }, { writers: userId }] };
    const libraries = await Libraries.find(visible, { fields: { name: 1, language: 1, recommended: 1 } }).fetchAsync();
    const nodes = await LibraryNodes.find({
      'root.id': { $in: libraries.map(library => library._id) },
      fillSlots: true,
      libraryTags: RULESET_TAG,
      removed: { $ne: true },
    }, { fields: { name: 1, root: 1, 'description.text': 1 }, limit: 50 }).fetchAsync();
    const collections = await LibraryCollections.find({
      ...visible,
      libraries: { $in: nodes.map(node => node.root.id) },
    }, { fields: { name: 1, libraries: 1, description: 1, language: 1, recommended: 1 } }).fetchAsync();
    const followedCollections = user?.subscribedLibraryCollections || [];
    const followedLibraries = user?.subscribedLibraries || [];
    return nodes.map(node => {
      const library = libraries.find(library => library._id === node.root.id);
      const collection = collections.find(collection => collection.libraries.includes(node.root.id));
      const text = [collection?.description, node.description?.text, collection?.name, library?.name]
        .filter(Boolean).join('\n');
      return {
        nodeId: node._id,
        name: collection?.name || library?.name || node.name,
        rulesetName: node.name,
        libraryId: node.root.id,
        libraryName: library?.name,
        collectionId: collection?._id,
        summary: plainSummary(collection?.description || node.description?.text),
        // The collection's or library's own language (UX13), else a guess
        language: collection?.language || library?.language || guessLanguage(text),
        recommended: !!(collection?.recommended || library?.recommended),
        followed: collection
          ? followedCollections.includes(collection._id)
          : followedLibraries.includes(node.root.id),
      };
    }).sort((a, b) => Number(b.followed) - Number(a.followed)
      || Number(b.recommended) - Number(a.recommended)
      || a.name.localeCompare(b.name));
  },
});

export default listRulesets;
