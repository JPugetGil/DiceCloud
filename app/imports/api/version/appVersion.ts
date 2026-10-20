import { Meteor } from 'meteor/meteor';

/**
 * The version of DiceCloud that runs, shown to the users (the side menu, the
 * About page): SemVer read from the commits by deploy/version.sh, the commit
 * (8 characters) and its date (ISO 8601)
 */
export type AppVersion = { version: string, commit: string, date: string };

/** The version the server put in the public settings; null when it could not read it */
export function appVersion(): AppVersion | null {
  return (Meteor.settings.public?.appVersion as AppVersion | null | undefined) ?? null;
}
