import { ValidatedMethod } from 'meteor/mdg:validated-method';
import { RateLimiterMixin } from 'ddp-rate-limiter-mixin';
import Tabletops from '../Tabletops';

const insertTabletop = new ValidatedMethod({

  name: 'tabletops.insert',

  validate: null,

  mixins: [RateLimiterMixin],
  // @ts-expect-error Rate limit not defined
  rateLimit: {
    numRequests: 2,
    timeInterval: 5000,
  },

  run() {
    if (!this.userId) {
      throw new Meteor.Error('tabletops.insert.denied',
        'You need to be logged in to insert a tabletop');
    }
    return Tabletops.insert({
      owner: this.userId,
      gameMasters: [this.userId],
      players: [],
      spectators: [],
      initiative: {
        active: false,
        roundNumber: 0,
      },
    });
  },
});

export default insertTabletop;
