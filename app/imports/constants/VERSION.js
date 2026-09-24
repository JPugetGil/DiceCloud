
const VERSION = Meteor.isClient ?
  'CLIENT' :
  process.env.CONTAINER_VERSION || getVersionFromGit();

export default VERSION;

function getVersionFromGit(){
  try {
    // require(), not import: child_process only exists on the server, and this
    // runs in a try so the client just falls through to the placeholder
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('child_process')
      .execSync('git rev-parse --short HEAD')
      .toString().trim();
  } catch {
    return 'GIT_VERSION_FAIL'
  }
}
