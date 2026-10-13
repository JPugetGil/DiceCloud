import SimpleSchema from 'meteor/aldeed:simple-schema';
import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import { Meteor } from 'meteor/meteor';
import Libraries from '/imports/api/library/Libraries';
import LibraryCollections from '/imports/api/library/LibraryCollections';

/*
 * A user subscribes to a library, or a library collection, which its slots
 * and searches then offer (getUserLibraryIds). The library's subscriber
 * count, which ranks it in the library browser, counts the subscribers.
 * Meteor.users.subscribeToLibrary and subscribeToLibraryCollection (Users.js).
 */

export const subscribeToLibrary = new ValidatedMethod({
  name: 'users.subscribeToLibrary',
  validate: new SimpleSchema({
    libraryId: {
      type: String,
      max: 32,
    },
    subscribe: {
      type: Boolean,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 2000,
  },
  async run({ libraryId, subscribe }) {
    if (!this.userId) throw 'Can only subscribe if logged in';
    // The count moves only when the user's subscription does: it counted every
    // call, and anyone could raise a library to the top of the browser, or
    // below zero, by subscribing again and again
    const changed = await Meteor.users.updateAsync(
      { _id: this.userId, subscribedLibraries: subscribe ? { $ne: libraryId } : libraryId },
      subscribe ? { $addToSet: { subscribedLibraries: libraryId } } : { $pullAll: { subscribedLibraries: [libraryId] } },
    );
    if (changed) {
      await Libraries.updateAsync({ _id: libraryId }, { $inc: { subscriberCount: subscribe ? 1 : -1 } });
    }
    return changed;
  }
});

export const subscribeToLibraryCollection = new ValidatedMethod({
  name: 'users.subscribeToLibraryCollection',
  validate: new SimpleSchema({
    libraryCollectionId: {
      type: String,
      max: 32,
    },
    subscribe: {
      type: Boolean,
    },
  }).validator(),
  mixins: [RateLimiterMixin],
  rateLimit: {
    numRequests: 5,
    timeInterval: 5000,
  },
  async run({ libraryCollectionId, subscribe }) {
    if (!this.userId) throw 'Can only subscribe if logged in';
    // The count moves only when the user's subscription does (subscribeToLibrary)
    const changed = await Meteor.users.updateAsync(
      {
        _id: this.userId,
        subscribedLibraryCollections: subscribe ? { $ne: libraryCollectionId } : libraryCollectionId,
      },
      subscribe
        ? { $addToSet: { subscribedLibraryCollections: libraryCollectionId } }
        : { $pullAll: { subscribedLibraryCollections: [libraryCollectionId] } },
    );
    if (changed) {
      await LibraryCollections.updateAsync({ _id: libraryCollectionId }, { $inc: { subscriberCount: subscribe ? 1 : -1 } });
    }
    return changed;
  }
});
