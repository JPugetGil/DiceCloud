import type { Random } from 'meteor/random';

declare module 'meteor/ddp' {
  namespace DDP {
    function randomStream(seed: string): typeof Random;
  }
}
