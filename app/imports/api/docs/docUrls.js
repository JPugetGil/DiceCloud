import { Meteor } from 'meteor/meteor';

/**
 * Docs stand for the address of the server they are read on with this
 * placeholder (the API examples need a full URL), so the same documentation
 * is right on every instance. Links to pages and images are relative instead.
 */
export const ROOT_URL_PLACEHOLDER = '{{ROOT_URL}}';

export function expandRootUrl(text) {
  if (!text?.includes(ROOT_URL_PLACEHOLDER)) return text;
  return text.replaceAll(ROOT_URL_PLACEHOLDER, Meteor.absoluteUrl().replace(/\/$/, ''));
}
