<template>
  <div class="attribute-viewer">
    <v-row
      dense
      align="stretch"
      justify="center"
      justify-sm="start"
    >
      <property-field
        v-if="model.value !== undefined ||
          fallbackValue !== undefined"
        :name="model.damage !== undefined ? $t('viewers.valueTotal') : $t('viewers.value')"
        center
      >
        <v-spacer />
        <div class="mr-3">
          <div
            v-if="model.damage !== undefined"
            class="text-h4 mr-3"
          >
            {{ model.value }} / {{ model.total }}
          </div>
          <div
            v-if="model.value !== undefined"
            class="text-h4 mr-3"
          >
            {{ model.value }}
          </div>
          <div
            v-else
            class="mono"
          >
            {{ fallbackValue }}
          </div>
        </div>
        <v-spacer />
        <increment-button
          v-if="context.creatureId"
          outlined
          icon
          tile
          color="primary"
          :data-id="`${model._id}-increment`"
          :value="model.value"
          :loading="damagePropertyLoading"
          @change="damageProperty"
        />
      </property-field>
      <property-field
        v-if="model.modifier !== undefined"
        :name="$t('viewers.modifier')"
        center
        :value="isFinite(model.modifier) ?
          numberToSignedString(model.modifier) :
          model.modifier"
      >
        <div class="text-h6">
          {{ numberToSignedString(model.modifier) }}
        </div>
      </property-field>
      <property-field
        :name="$t('viewers.variableName')"
        mono
        :value="model.variableName"
      />
      <property-field
        :name="$t('viewers.attributeType')"
        :value="attributeTypes[model.attributeType]"
      />
      <property-field
        v-if="model.attributeType === 'hitDice' && model.hitDiceSize"
        :name="$t('viewers.hitDiceSize')"
        :value="model.hitDiceSize"
      />
      <property-field
        v-if="model.attributeType === 'hitDice'"
        :name="$t('viewers.conModifier')"
        :value="isFinite(model.constitutionMod) ?
          numberToSignedString(model.constitutionMod) :
          model.constitutionMod"
      />
      <property-field
        v-if="model.attributeType === 'spellSlot' && model.spellSlotLevel"
        :name="$t('viewers.spellSlotLevel')"
        :value="model.spellSlotLevel.value !== undefined ? model.spellSlotLevel.value : model.spellSlotLevel.calculation"
      />
      <property-field
        v-if="model.attributeType === 'ability' && model.proficiency !== undefined"
        :name="$t('propertyTypes.proficiency.name')"
      >
        <v-icon
          style="height: 12px"
          class="ml-1 mr-2"
        >
          {{ proficiencyIcon }}
        </v-icon>
        <div>
          {{ proficiencyText[model.proficiency] }}
        </div>
      </property-field>
      <property-field
        v-if="reset && model.attributeType !== 'hitDice'"
        :name="$t('viewers.reset')"
        :value="reset"
      />
      <property-field
        v-if="model.overridden"
        :cols="{cols: 6, md: 12}"
        :name="$t('viewers.overridden')"
        :value="$t('viewers.overriddenText')"
      />
    </v-row>
    <v-row dense>
      <property-description
        :name="$t('common.description')"
        :model="model.description"
      />
    </v-row>
    <v-row dense>
      <property-field
        v-if="effects && effects.length"
        :cols="{col: 12}"
        :name="$t('viewers.effects')"
      >
        <v-list style="width: 100%;">
          <attribute-effect
            v-for="effect in effects"
            :key="effect._id"
            :model="effect"
            :attribute="model"
            :data-id="effect._id"
            :hide-breadcrumbs="effect._id === model._id"
            @click="effect._id !== model._id && clickEffect(effect._id)"
          />
        </v-list>
      </property-field>
    </v-row>
  </div>
</template>

<script setup>
import { inject, ref, computed } from 'vue';
import numberToSignedString from '../../../../api/utility/numberToSignedString';
import AttributeEffect from '/imports/client/ui/properties/components/attributes/AttributeEffect.vue';
import IncrementButton from '/imports/client/ui/components/IncrementButton.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import getProficiencyIcon from '/imports/client/ui/utility/getProficiencyIcon';
import {snackbar} from '/imports/client/ui/components/snackbars/SnackbarQueue';
import sortEffects from '/imports/client/ui/utility/sortEffects';
import doAction from '/imports/client/ui/creature/actions/doAction';
import getPropertyTitle from '/imports/client/ui/properties/shared/getPropertyTitle';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const context = inject('context', {});

const attributeTypes = ref({
  ability: t('attributeTypes.ability'),
  stat: t('attributeTypes.stat'),
  modifier: t('attributeTypes.modifier'),
  hitDice: t('attributeTypes.hitDice'),
  healthBar: t('attributeTypes.healthBar'),
  resource: t('attributeTypes.resource'),
  spellSlot: t('attributeTypes.spellSlot'),
  utility: t('attributeTypes.utility'),
});

const proficiencyText = ref({
  0: t('proficiencyLevels.none'),
  1: t('proficiencyLevels.proficient'),
  0.49: t('proficiencyLevels.halfDown'),
  0.5: t('proficiencyLevels.halfUp'),
  2: t('proficiencyLevels.double'),
});

const damagePropertyLoading = ref(false);

const dialogStackStore = useDialogStackStore();

const reset = computed(() => {
  let reset = props.model.reset
  if (reset === 'shortRest'){
    return t('viewers.resetShortRest');
  } else if (reset === 'longRest'){
    return t('viewers.resetLongRest');
  }
  return undefined;
});

const proficiencyIcon = computed(() => {
  return getProficiencyIcon(props.model.proficiency);
});

const effects = computed(() => {
  if (!props.model.effectIds) return [];
  const effects = CreatureProperties.find({ _id: { $in: props.model.effectIds } }).fetch();
  return sortEffects(effects);
});

const fallbackValue = computed(() => {
  return props.model.baseValue?.value ?? props.model.baseValue?.calculation;
});

function clickEffect(id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `${id}`,
    data: {_id: id},
  });
}

async function damageProperty({ type, value }) {
  const model = props.model;
  damagePropertyLoading.value = true;
  await doAction({
    creatureId: model.root.id,
    elementId: `${model._id}-increment`,
    task: {
      subtaskFn: 'damageProp',
      targetIds: [model.root.id],
      params: {
        title: getPropertyTitle(model),
        operation: type,
        value,
        targetProp: model,
      },
    },
  }).catch((error) => {
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  }).finally(() => {
    damagePropertyLoading.value = false;
  });
}
</script>

<style lang="css" scoped>
  .ability-value {
    font-weight: 600;
    font-size: 24px !important;
    color: rgba(0, 0, 0, 0.54);
  }
  .mod, .ability-value {
    text-align: center;
    width: 100%;
  }
  .attribute-value {
    text-align: center;
  }
  .mono {
    font-family: monospace !important;
  }
</style>
