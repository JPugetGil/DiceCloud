import type { DDP } from 'meteor/ddp';

declare module 'meteor/meteor' {
  namespace Meteor {
    interface User {
      roles?: string[];
    }
    // The client's connection to the server: ddp-client, which sets it, ships
    // no types
    const connection: DDP.DDPStatic & { [key: string]: any };
  }
}
