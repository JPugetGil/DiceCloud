<template>
  <div class="check-input pa-4">
    <div class="d-flex align-start mb-3">
      <div class="flex-1-1">
        <div
          class="text-title-large"
          data-id="check-title"
        >
          {{ title }}
          <span
            v-if="modifierText"
            class="text-primary ms-1"
          >{{ modifierText }}</span>
        </div>
        <div
          v-if="model.dc !== null && model.dc !== undefined && model.dc !== ''"
          class="text-body-medium text-medium-emphasis"
        >
          {{ $t('check.dcValue', { dc: model.dc }) }}
        </div>
      </div>
      <v-btn
        variant="text"
        icon
        size="small"
        :aria-label="$t('common.close')"
        data-id="check-close"
        @click="emit('cancel')"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </div>
    <div class="d-flex flex-wrap align-center justify-center ga-4">
      <div class="d-flex flex-column align-center ga-3">
        <v-btn-toggle
          :model-value="model.advantage || 0"
          mandatory
          divided
          border
          rounded="pill"
          density="comfortable"
          color="primary"
          data-id="check-advantage"
          @update:model-value="changeAdvantage"
        >
          <v-btn :value="-1">
            {{ $t('common.disadvantage') }}
          </v-btn>
          <v-btn :value="0">
            {{ $t('check.normal') }}
          </v-btn>
          <v-btn :value="1">
            {{ $t('common.advantage') }}
          </v-btn>
        </v-btn-toggle>
        <div style="position: relative;">
          <v-scale-transition
            origin="center center"
          >
            <vertical-hex
              v-if="model.advantage"
              id="extra-hex"
              style="position:absolute; transition: margin-left 0.3s ease;"
              :style="{marginLeft: model.advantage == 1 ? '24px' : '-24px'}"
              disable-hover
            />
          </v-scale-transition>
          <vertical-hex
            id="roll-hex"
            role="button"
            tabindex="0"
            :aria-label="$t('common.roll')"
            @click="emit('continue')"
          >
            <div>
              {{ $t('common.roll') }}
            </div>
          </vertical-hex>
        </div>
        <div class="text-body-small text-medium-emphasis">
          {{ $t('check.enterToRoll') }}
        </div>
      </div>
      <div class="d-flex flex-column check-input__fields">
        <smart-select
          :label="$t('check.ability')"
          :items="abilityOptions"
          :model-value="model.abilityVariableName"
          @change="(value, ack) => change('abilityVariableName', value, ack)"
        />
        <smart-select
          :label="$t('check.skill')"
          :items="skillOptions"
          :model-value="model.skillVariableName"
          @change="(value, ack) => change('skillVariableName', value, ack)"
        />
        <!-- Applied as it is typed, so that Enter rolls against it -->
        <v-text-field
          :label="$t('check.dc')"
          :model-value="model.dc ?? ''"
          type="number"
          variant="outlined"
          @update:model-value="value => model = { ...model, dc: value === '' ? null : Number(value) }"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import VerticalHex from '/imports/ui/components/VerticalHex.vue';
import createListOfProperties from '/imports/ui/properties/forms/shared/lists/createListOfProperties';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import numberToSignedString from '/imports/api/utility/numberToSignedString';

const model = defineModel({
  /**
    advantage: 0 | 1 | -1;
    skillVariableName?: string;
    abilityVariableName?: string;
    dc: number | null;
    contest?: true;
    targetSkillVariableName?: string;
    targetAbilityVariableName?: string;
  */
  type: Object,
  required: true,
});

const emit = defineEmits(['continue', 'cancel']);

const { t } = useI18n();

// The checked creature's abilities and skills. A check task has no `prop` (it
// was read here, so the dialog failed as soon as it opened); its target is the
// creature being checked.
const creatureId = model.value.targetIds?.[0];

const abilityOptions = createListOfProperties({
  attributeType: 'ability',
  'root.id': creatureId,
}, true);

const skillOptions = createListOfProperties({
  type: 'skill',
  'root.id': creatureId,
}, true);

const findStat = variableName => variableName && CreatureProperties.findOne({
  'root.id': creatureId,
  variableName,
  removed: { $ne: true },
  inactive: { $ne: true },
  overridden: { $ne: true },
}, { fields: { name: 1, value: 1, modifier: 1, abilityMod: 1 } });

const skill = autorun(() => findStat(model.value.skillVariableName)).result;
const ability = autorun(() => findStat(model.value.abilityVariableName)).result;

// Named and summed as the engine does (applyCheckTask): the skill's bonus
// without its own ability, plus the chosen ability's modifier
const title = computed(() => {
  const abilityName = ability.value?.name;
  const skillName = skill.value?.name;
  if (abilityName && skillName) return `${abilityName} (${skillName})`;
  return abilityName || skillName || t('check.check');
});

const modifierText = computed(() => {
  if (!skill.value && !ability.value) return undefined;
  const skillBonus = (skill.value?.value || 0) - (skill.value?.abilityMod || 0);
  return numberToSignedString(skillBonus + (ability.value?.modifier || 0));
});

function changeAdvantage(e) {
  model.value = { ...model.value, advantage: e };
}

function change(key, value, ack) {
  model.value = { ...model.value, [key]: value };
  ack();
}

// Enter rolls, unless it is choosing in an open select
function onKeydown(event) {
  if (event.key !== 'Enter' || event.isComposing) return;
  if (document.querySelector('.v-overlay--active .v-select__content, .v-overlay--active .v-list')) return;
  event.preventDefault();
  emit('continue');
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style scoped>
.check-input__fields {
  min-width: 200px;
}
</style>
