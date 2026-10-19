import type { DDP } from 'meteor/ddp';

declare module 'meteor/meteor' {
  namespace Meteor {
    // The app's fields of a user (imports/api/users/Users.js, userSchema)
    interface User {
      roles?: string[];
      heartbeat?: Date;
      darkMode?: boolean;
      subscribedLibraries?: string[];
      subscribedLibraryCollections?: string[];
      fileStorageUsed?: number;
      preferences?: {
        swapAbilityScoresAndModifiers?: boolean,
        hidePropertySelectDialogHelp?: boolean,
        reduceMotion?: boolean,
        language?: 'en' | 'fr',
        discordMentionOff?: boolean,
        distanceUnit?: string,
        weightUnit?: string,
      };
      discordAccount?: { id: string, username?: string, linkedAt?: Date };
    }
    // The client's connection to the server: ddp-client, which sets it, ships
    // no types
    const connection: DDP.DDPStatic & { [key: string]: any };
  }
}

// What Meteor 3 has and its types leave out
declare module 'meteor/meteor' {
  namespace Meteor {
    // A user's login tokens (accounts-base)
    interface UserServices {
      resume?: { loginTokens?: { hashedToken?: string, when?: Date }[] };
    }
    // The DDP server: publication strategies (startup/server/publicationStrategies.js)
    const server: { setPublicationStrategy(collectionName: string, strategy: object): void, [key: string]: any };
    // bozhao:link-accounts: links a Google account to the signed in user
    function linkWithGoogle(options?: object, callback?: (error?: Meteor.Error | Error) => void): void;
    function linkWithGoogle(callback: (error?: Meteor.Error | Error) => void): void;
  }
}

declare module 'meteor/accounts-base' {
  namespace Accounts {
    // The users' collection, and internals the REST login, the login token
    // limit and the account deletion use (api/rest/server/restLogin.js,
    // startup/server/limitLoginTokens.js, users/methods/deleteMyAccount.js)
    const users: import('meteor/mongo').Mongo.Collection<import('meteor/meteor').Meteor.User>;
    function _insertLoginToken(userId: string, token: object): Promise<void>;
    // The login token a connection is signed in with, and watched: null signs
    // it out (users/methods/deleteMyAccount.js, as Meteor's logout method)
    function _setLoginToken(userId: string | null, connection: object, newToken: string | null): void;
    function _tokenExpiration(when: Date): Date;
  }
}

// What aldeed:collection2 v4 exports (its definitions call it collection2)
declare module 'meteor/aldeed:collection2' {
  const Collection2: { load(): Promise<void> };
}

declare global {
  namespace Assets {
    // Meteor 3's asynchronous reading of a private asset
    function getTextAsync(assetPath: string): Promise<string>;
  }
}
