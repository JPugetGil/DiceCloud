import getSlug from 'speakingurl';

/** @param {{ name?: string }} creature */
export default function getCreatureUrlName({name}){
  return getSlug(name, {maintainCase: true}) || '-';
}
