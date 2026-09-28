import { DDPRateLimiter } from 'meteor/ddp-rate-limiter';

// Limit all subscriptions to 1/s
DDPRateLimiter.addRule({
  type: 'subscription',
}, 50, 10000);
