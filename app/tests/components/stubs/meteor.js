// What the tested components read from Meteor (meteor/meteor, meteor/tracker,
// meteor/random), in a browser where nobody is signed in. A test sets
// Meteor.settings.public before it imports a component that reads it.
export const Meteor = {
  isClient: true,
  isServer: false,
  isTest: true,
  isDevelopment: false,
  settings: { public: {} },
  userId: () => null,
  user: () => null,
  startup: callback => callback(),
  Error: class extends Error {
    constructor(error, reason) {
      super(reason || error);
      this.error = error;
      this.reason = reason;
    }
  },
};

export const Tracker = {
  autorun: callback => {
    const computation = { stop() {}, firstRun: true };
    callback(computation);
    return computation;
  },
  nonreactive: callback => callback(),
  afterFlush: callback => setTimeout(callback),
};

let counter = 0;
export const Random = {
  id: () => `random${counter++}`,
  fraction: Math.random,
};
