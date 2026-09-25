<template>
  <div class="spell-form">
    <v-row dense>
      <v-col
        cols="12"
        sm="6"
        md="4"
      >
        <smart-switch
          class="ml-2"
          :label="$t('forms.spell.alwaysPrepared')"
          :value="model.alwaysPrepared"
          :error-messages="errors.alwaysPrepared"
          @change="(value, ack) => change('alwaysPrepared', value, ack)"
        />
      </v-col>
      <v-col
        v-show="!model.alwaysPrepared"
        cols="12"
        sm="6"
        md="4"
      >
        <smart-switch
          class="ml-2"
          :label="$t('forms.spell.prepared')"
          :value="model.prepared"
          :error-messages="errors.prepared"
          @change="(value, ack) => change('prepared', value, ack)"
        />
      </v-col>
      <v-col
        v-show="model.level"
        cols="12"
        sm="6"
        md="4"
      >
        <smart-switch
          class="ml-2"
          :label="$t('forms.spell.withoutSlots')"
          :value="model.castWithoutSpellSlots"
          :error-messages="errors.castWithoutSpellSlots"
          @change="(value, ack) => change('castWithoutSpellSlots', value, ack)"
        />
      </v-col>
    </v-row>
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <smart-select
          :label="$t('forms.level')"
          :hint="$t('forms.spell.levelHint')"
          :items="spellLevels"
          :value="model.level"
          :error-messages="errors.level"
          @change="(value, ack) => change('level', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-select
          :label="$t('forms.spell.school')"
          :items="magicSchools"
          :value="model.school"
          :error-messages="errors.school"
          @change="(value, ack) => change('school', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          :label="$t('forms.spell.castingTime')"
          :value="model.castingTime"
          :error-messages="errors.castingTime"
          @change="(value, ack) => change('castingTime', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          :label="$t('forms.spell.range')"
          :value="model.range"
          :error-messages="errors.range"
          @change="(value, ack) => change('range', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          :label="$t('forms.spell.duration')"
          :value="model.duration"
          :error-messages="errors.duration"
          @change="(value, ack) => change('duration', value, ack)"
        />
      </v-col>
    </v-row>
    <v-row class="mt-0">
      <v-col
        cols="6"
        md="3"
        class="pt-1"
      >
        <smart-checkbox
          :label="$t('spellComponents.verbal')"
          :value="model.verbal"
          :error-messages="errors.verbal"
          @change="(value, ack) => change('verbal', value, ack)"
        />
      </v-col>
      <v-col
        cols="6"
        md="3"
        class="pt-1"
      >
        <smart-checkbox
          :label="$t('spellComponents.somatic')"
          :value="model.somatic"
          :error-messages="errors.somatic"
          @change="(value, ack) => change('somatic', value, ack)"
        />
      </v-col>
      <v-col
        cols="6"
        md="3"
        class="pt-1"
      >
        <smart-checkbox
          :label="$t('spellComponents.concentration')"
          :value="model.concentration"
          :error-messages="errors.concentration"
          @change="(value, ack) => change('concentration', value, ack)"
        />
      </v-col>
      <v-col
        cols="6"
        md="3"
        class="pt-1"
      >
        <smart-checkbox
          :label="$t('spellComponents.ritual')"
          :value="model.ritual"
          :error-messages="errors.ritual"
          @change="(value, ack) => change('ritual', value, ack)"
        />
      </v-col>
    </v-row>
    <v-row dense>
      <v-col cols="12">
        <text-field
          :label="$t('spellComponents.material')"
          :value="model.material"
          :error-messages="errors.material"
          @change="(value, ack) => change('material', value, ack)"
        />
      </v-col>
    </v-row>
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <smart-toggle
          :label="$t('forms.targetCreature')"
          :value="model.target"
          :options="[
            {name: $t('forms.singleTarget'), value: 'singleTarget'},
            {name: $t('forms.multipleTargets'), value: 'multipleTargets'},
            {name: $t('forms.self'), value: 'self'},
          ]"
          :error-messages="errors.target"
          @change="(value, ack) => change('target', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <v-slide-x-transition mode="out-in">
          <v-switch
            v-if="!isAttack"
            class="ml-4"
            :label="$t('forms.attackRoll')"
            :value="attackSwitch"
            @update:model-value="e => attackSwitch = e"
          />
          <computed-field
            v-else
            :label="$t('forms.spell.toHit')"
            prefix="1d20 + "
            :hint="$t('forms.spell.toHitHint')"
            :model="model.attackRoll"
            :error-messages="errors.attackRoll"
            @change="({path, value, ack}) =>
              $emit('change', {path: ['attackRoll', ...path], value, ack})"
          >
            <template #prepend>
              <v-btn
                variant="text"
                :disabled="!!(model.attackRoll && model.attackRoll.calculation)"
                icon
                style="margin-top: -12px;"
                @click="attackSwitch = false"
              >
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </template>
          </computed-field>
        </v-slide-x-transition>
      </v-col>
    </v-row>
    <inline-computation-field
      :label="$t('forms.summary')"
      :hint="$t('forms.spell.summaryHint')"
      :model="model.summary"
      :error-messages="errors['summary.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['summary', ...path], value, ack})"
    />
    <inline-computation-field
      :label="$t('common.description')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />
    <form-sections type="spell">
      <form-section :name="$t('forms.resourcesConsumed')">
        <resources-form
          :model="model.resources"
          @change="({path, value, ack}) => $emit('change', {path: ['resources', ...path], value, ack})"
          @push="({path, value, ack}) => $emit('push', {path: ['resources', ...path], value, ack})"
          @pull="({path, ack}) => $emit('pull', {path: ['resources', ...path], ack})"
        />
      </form-section>

      <form-section :name="$t('forms.limitUses')">
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <computed-field
              :label="$t('forms.uses')"
              :hint="$t('forms.usesHint')"
              class="mr-2"
              :model="model.uses"
              :error-messages="errors.uses"
              @change="({path, value, ack}) =>
                $emit('change', {path: ['uses', ...path], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <text-field
              :label="$t('forms.usesUsed')"
              type="number"
              :hint="$t('forms.usesUsedHint')"
              style="flex-basis: 300px;"
              :value="model.usesUsed"
              :error-messages="errors.uses"
              @change="(value, ack) => change('usesUsed', value, ack)"
            />
          </v-col>
        </v-row>
        <reset-selector
          :hint="$t('forms.resetUsesHint')"
          :value="model.reset"
          :error-messages="errors.reset"
          @change="(value, ack) => change('reset', value, ack)"
        />
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import ResourcesForm from '/imports/client/ui/properties/forms/ResourcesForm.vue';
import ResetSelector from '/imports/client/ui/components/ResetSelector.vue';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change', 'push', 'pull']);

const magicSchools = ref([
  {
    title: t('spellSchools.abjuration'),
    value: 'abjuration',
  }, {
    title: t('spellSchools.conjuration'),
    value: 'conjuration',
  }, {
    title: t('spellSchools.divination'),
    value: 'divination',
  }, {
    title: t('spellSchools.enchantment'),
    value: 'enchantment',
  }, {
    title: t('spellSchools.evocation'),
    value: 'evocation',
  }, {
    title: t('spellSchools.illusion'),
    value: 'illusion',
  }, {
    title: t('spellSchools.necromancy'),
    value: 'necromancy',
  }, {
    title: t('spellSchools.transmutation'),
    value: 'transmutation',
  },
]);

const spellLevels = ref([
  {
    title: t('forms.spell.cantrip'),
    value: 0,
  }, {
    title: t('forms.spell.levelN', { level: 1 }),
    value: 1,
  }, {
    title: t('forms.spell.levelN', { level: 2 }),
    value: 2,
  }, {
    title: t('forms.spell.levelN', { level: 3 }),
    value: 3,
  }, {
    title: t('forms.spell.levelN', { level: 4 }),
    value: 4,
  }, {
    title: t('forms.spell.levelN', { level: 5 }),
    value: 5,
  }, {
    title: t('forms.spell.levelN', { level: 6 }),
    value: 6,
  }, {
    title: t('forms.spell.levelN', { level: 7 }),
    value: 7,
  }, {
    title: t('forms.spell.levelN', { level: 8 }),
    value: 8,
  }, {
    title: t('forms.spell.levelN', { level: 9 }),
    value: 9,
  },
]);

const attackSwitch = ref(false);

const isAttack = computed(() => {
  return attackSwitch.value || !!props.model.attackRoll?.calculation
});

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>

<style lang="css" scoped>
.v-input--checkbox {
  margin-top: 0;
}
</style>
