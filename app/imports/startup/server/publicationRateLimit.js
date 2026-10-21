import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

// At most 50 subscriptions every 10 seconds, per connection. The counter
// follows the rule's keys: without connectionId, one counter for the whole
// server let any client refuse everyone else's subscriptions
DDPRateLimiter.addRule({
  type: 'subscription',
  connectionId() {
    return true;
  },
}, 50, 10000);
