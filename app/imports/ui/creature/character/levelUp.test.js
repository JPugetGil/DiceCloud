import { assert } from 'chai';
import { levelSnapshot, levelChanges } from '/imports/ui/creature/character/levelUp';

const attribute = (_id, attributeType, name, fields) => ({ _id, type: 'attribute', attributeType, name, ...fields });

describe('Level up', function () {
  it('lists the numbers a level raised, hit points first, and the features gained', function () {
    const before = levelSnapshot([
      attribute('pb', 'modifier', 'Proficiency Bonus', { value: 2 }),
      attribute('hp', 'healthBar', 'Hit Points', { value: 10, total: 12 }),
      attribute('str', 'ability', 'Strength', { value: 14 }),
      { _id: 'f1', type: 'feature', name: 'Rage' },
    ]);
    const after = levelSnapshot([
      attribute('pb', 'modifier', 'Proficiency Bonus', { value: 3 }),
      attribute('hp', 'healthBar', 'Hit Points', { value: 10, total: 20 }),
      attribute('str', 'ability', 'Strength', { value: 14 }),
      { _id: 'f1', type: 'feature', name: 'Rage' },
      { _id: 'f2', type: 'feature', name: 'Extra Attack' },
      { _id: 'n1', type: 'note', name: 'A note' },
    ]);
    assert.deepEqual(levelChanges(before, after), {
      changed: [
        { id: 'hp', name: 'Hit Points', from: 12, to: 20 },
        { id: 'pb', name: 'Proficiency Bonus', from: 2, to: 3 },
      ],
      gained: ['Extra Attack'],
    });
  });

  it('leaves out what was not there before, and damage taken', function () {
    const before = levelSnapshot([attribute('hp', 'healthBar', 'Hit Points', { value: 12, total: 12 })]);
    const after = levelSnapshot([
      attribute('hp', 'healthBar', 'Hit Points', { value: 5, total: 12 }),
      attribute('ki', 'resource', 'Ki', { total: 2 }),
    ]);
    assert.deepEqual(levelChanges(before, after), { changed: [], gained: [] });
  });
});
