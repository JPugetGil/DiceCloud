import action from '/imports/ui/properties/components/folders/folderGroupComponents/ActionGroupComponent.vue';
import attribute from './folderGroupComponents/AttributeGroupComponent.vue';
import buff from '/imports/ui/properties/components/buffs/BuffListItem.vue';
import container from '/imports/ui/properties/components/inventory/ContainerCard.vue';
import feature from '/imports/ui/properties/components/features/FeatureCard.vue';
import item from '/imports/ui/properties/components/inventory/ItemListTile.vue';
import note from '/imports/ui/properties/components/persona/NoteCard.vue';
import propertySlot from '/imports/ui/properties/components/folders/folderGroupComponents/SlotBuildTree.vue';
import skill from '/imports/ui/properties/components/skills/SkillListTile.vue';
import spellList from '/imports/ui/properties/components/spells/SpellListCard.vue';
import spell from '/imports/ui/properties/components/spells/SpellListTile.vue';
import toggle from '/imports/ui/properties/components/toggles/ToggleCard.vue';

export default {
  action,
  //adjustment,
  attribute,
  buff,
  //buffRemover,
  //branch,
  //constant,
  container,
  //class: classComponent,
  //classLevel,
  //damage,
  //damageMultiplier,
  //effect,
  feature,
  // folder // Like actions, we don't show sub-folders
  item,
  note,
  //pointBuy,
  //proficiency,
  propertySlot,
  //reference,
  //roll,
  //savingThrow,
  skill,
  spellList,
  spell,
  toggle,
  //trigger,
};
