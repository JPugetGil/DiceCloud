import { assert } from 'chai';
import { parseDie, rollsFromLog } from '/imports/ui/dice/logDice';

describe('Dice in the log', function () {
  it('reads a die and its marks', function () {
    assert.deepEqual(parseDie('15'), { value: 15 });
    assert.deepEqual(parseDie('~~8~~'), { value: 8, dropped: true });
    assert.deepEqual(parseDie('**6**'), { value: 6, bold: true });
    assert.isUndefined(parseDie('x'));
  });

  it('reads a check: its title, its dice and its result in bold', function () {
    assert.deepEqual(rollsFromLog([
      { name: 'Strength (Athletics)' },
      { name: 'Roll (Advantage)', value: '1d20 [ 15, ~~8~~ ] +0\n**15**' },
    ]), {
      title: 'Strength (Athletics)',
      groups: [{
        label: 'Roll (Advantage)', dice: [{ value: 15, size: 20 }, { value: 8, dropped: true, size: 20 }], total: 15,
      }],
    });
  });

  it('reads a roll typed in the log, whose result is on the next line', function () {
    assert.deepEqual(rollsFromLog([
      { value: '1d20 + 5' }, { value: '1d20 [11] + 5' }, { value: '16' },
    ]), {
      title: undefined,
      groups: [{ label: undefined, dice: [{ value: 11, size: 20 }], total: 16 }],
    });
  });

  it('keeps each line\'s dice apart, and leaves silenced lines out', function () {
    const { groups } = rollsFromLog([
      { name: 'Longsword' },
      { name: 'To hit', value: '1d20 [20] + 5\n**25**' },
      { name: 'Damage', value: '2d6 [ 3, 6 ] + 1d4 [2] + 3\n**14** slashing damage' },
      { name: 'Secret', value: '1d20 [1]', silenced: true },
    ]);
    assert.deepEqual(groups.map(group => [group.label, group.dice.map(die => `d${die.size}:${die.value}`), group.total]), [
      ['To hit', ['d20:20'], 25],
      ['Damage', ['d6:3', 'd6:6', 'd4:2'], 14],
    ]);
  });

  it('finds no dice in a log without a roll', function () {
    assert.isEmpty(rollsFromLog([{ name: 'Short Rest', value: 'Nothing to restore' }]).groups);
    assert.isEmpty(rollsFromLog().groups);
  });
});
