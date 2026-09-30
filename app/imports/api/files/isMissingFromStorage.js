import { Meteor } from 'meteor/meteor';

/**
 * Whether a file failed to reach S3. With S3 on, such a file only lives on the
 * server's disk, which Galaxy wipes on every restart: its link will break.
 * Right after an upload this is briefly true, until the copy to S3 lands.
 */
export default function isMissingFromStorage(file) {
  if (!Meteor.settings.public?.useS3) return false;
  return Object.values(file?.versions || {})
    .some(version => !version?.meta?.pipePath);
}
