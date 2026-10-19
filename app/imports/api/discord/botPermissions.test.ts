import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { BOT_PERMISSION_INTEGER } from '/imports/api/discord/botPermissions';
import { serverInstallUrl } from '/imports/ui/discord/discordInstall';

describe('Discord bot permissions', function () {
  it('are the four the bot asks for, as Discord writes their sum', function () {
    assert.equal(String(BOT_PERMISSION_INTEGER), '309774517248');
  });

  it('are the ones the installation link on a server asks for', function () {
    const settings = Meteor.settings.public as Record<string, unknown>;
    const previous = settings.discordApplicationId;
    settings.discordApplicationId = '123';
    try {
      assert.include(serverInstallUrl(undefined), '&permissions=309774517248&');
    } finally {
      settings.discordApplicationId = previous;
    }
  });
});
