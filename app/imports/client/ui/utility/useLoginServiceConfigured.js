import { autorun } from 'vue-meteor-tracker';
import { ServiceConfiguration } from 'meteor/service-configuration';

/**
 * Whether an OAuth login service such as 'google' is configured on the server.
 *
 * Every client subscribes to the login service configurations (accounts-base
 * publishes them without their secrets), so this becomes true once the
 * service's entry arrives. Without one, `Meteor.loginWithGoogle` only fails with
 * "Service not configured". The README explains how to configure Google.
 */
export default function useLoginServiceConfigured(service) {
  return autorun(() => !!ServiceConfiguration.configurations.findOne({ service })).result;
}
