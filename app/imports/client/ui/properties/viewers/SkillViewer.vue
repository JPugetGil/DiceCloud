<template>
  <div class="skill-viewer">
    <v-row
      dense
      justify="center"
      justify-sm="start"
    >
      <property-field
        v-if="model.value !== undefined"
        center
        large
        :name="$t('viewers.rollBonus')"
        :value="isFinite(model.value) ?
          numberToSignedString(model.value) :
          model.value"
      />
      <property-field
        v-if="model.proficiency !== undefined"
        :name="$t('propertyTypes.proficiency.name')"
      >
        <v-icon
          style="height: 12px"
          class="ml-1 mr-2"
        >
          {{ icon }}
        </v-icon>
        <div>
          {{ proficiencyText[model.proficiency] }}
        </div>
      </property-field>
      <property-field
        :name="$t('viewers.variableName')"
        mono
        :value="model.variableName"
      />
      <property-field
        :name="$t('check.ability')"
        mono
        :value="model.ability"
      />
      <property-field
        :name="$t('viewers.skillType')"
        :value="skillTypes[model.skillType]"
      />
      <property-field
        v-if="'passiveBonus' in model"
        :name="$t('viewers.passiveScore')"
        :value="passiveScore"
      />
      <property-field
        v-if="model.overridden"
        :cols="{cols: 6, md: 12}"
        :name="$t('viewers.overridden')"
        :value="$t('viewers.overriddenText')"
      />
      <property-target-tags
        :model="model"
      />
    </v-row>
    <v-row dense>
      <property-description
        :name="$t('viewers.descriptionLower')"
        :model="model.description"
      />
    </v-row>
    <v-row
      v-if="ability || (effects && effects.length)"
      dense
    >
      <property-field
        :cols="{col: 12}"
        :name="$t('viewers.effects')"
      >
        <v-list style="width: 100%">
          <attribute-effect
            v-if="ability"
            :key="ability._id"
            :model="ability"
            :attribute="model"
            :data-id="ability._id"
            @click="clickEffect(ability._id)"
          />
          <attribute-effect
            v-for="effect in effects"
            :key="effect._id"
            :model="effect"
            :attribute="model"
            :data-id="effect._id"
            @click="clickEffect(effect._id)"
          />
        </v-list>
      </property-field>
    </v-row>
    <v-row
      v-if="proficiencies && proficiencies.length"
      dense
    >
      <property-field
        :cols="{col: 12}"
        :name="$t('viewers.proficiencies')"
      >
        <v-list style="width: 100%">
          <skill-proficiency
            v-for="proficiency in proficiencies"
            :key="proficiency._id"
            :model="proficiency"
            :proficiency-bonus="proficiencyBonus"
            :data-id="proficiency._id"
            @click="clickEffect(proficiency._id)"
          />
        </v-list>
      </property-field>
    </v-row>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import numberToSignedString from '../../../../api/utility/numberToSignedString';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import AttributeEffect from '/imports/client/ui/properties/components/attributes/AttributeEffect.vue';
import SkillProficiency from '/imports/client/ui/properties/components/skills/SkillProficiency.vue';
import getProficiencyIcon from '/imports/client/ui/utility/getProficiencyIcon';
import sortEffects from '/imports/client/ui/utility/sortEffects';
import PropertyTargetTags from '/imports/client/ui/properties/viewers/shared/PropertyTargetTags.vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const context = inject('context', {});

const proficiencyText = {
  0: t('proficiencyLevels.none'),
  1: t('proficiencyLevels.proficient'),
  0.49: t('proficiencyLevels.halfDown'),
  0.5: t('proficiencyLevels.halfUp'),
  2: t('proficiencyLevels.double'),
};

const skillTypes = {
  skill: t('skillTypes.skill'),
  save: t('skillTypes.save'),
  check: t('skillTypes.check'),
  tool: t('skillTypes.tool'),
  weapon: t('skillTypes.weapon'),
  armor: t('skillTypes.armor'),
  language: t('skillTypes.language'),
  utility: t('skillTypes.utility'),
};

const isFinite = Number.isFinite;


const icon = computed(() => getProficiencyIcon(props.model.proficiency));

const passiveScore = computed(() => 10 + props.model.value + props.model.passiveBonus);

const effects = computed(() => {
  if (!props.model.effectIds) return [];
  const effectsList = CreatureProperties.find({ _id: { $in: props.model.effectIds } }).fetch();
  return sortEffects(effectsList);
});

function clickEffect(id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `${id}`,
    data: { _id: id },
  });
}

const { result: proficiencies } = autorun(() => {
  if (!props.model.proficiencyIds) return [];
  return CreatureProperties.find({
    _id: { $in: props.model.proficiencyIds },
  }, {
    sort: { left: 1 }
  }).fetch();
});

const { result: ability } = autorun(() => {
  let creatureId = context.creatureId;
  let abilityVar = props.model.ability;
  if (!creatureId || !abilityVar) return;
  
  let abilityProp = CreatureProperties.findOne({
    ...getFilter.descendantsOfRoot(creatureId),
    variableName: abilityVar,
    type: 'attribute',
    removed: { $ne: true },
    inactive: { $ne: true },
    overridden: { $ne: true },
  });
  
  if (!abilityProp) return;
  
  return {
    _id: abilityProp._id,
    name: abilityProp.name,
    operation: 'base',
    amount: { value: abilityProp.modifier },
    stats: [props.model.variableName],
    root: abilityProp.root,
  };
});

const { result: proficiencyBonus } = autorun(() => {
  if (!context.creatureId) return;
  return CreatureProperties.findOne({
    ...getFilter.descendantsOfRoot(context.creatureId),
    variableName: 'proficiencyBonus',
    overridden: { $ne: true },
    removed: { $ne: true },
    inactive: { $ne: true },
  })?.value;
});
</script>

<style lang="css" scoped>

</style>
