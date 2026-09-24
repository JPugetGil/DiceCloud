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
          label="Always prepared"
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
          label="Prepared"
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
          label="Cast without spell slots"
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
          label="Level"
          hint="The spell level"
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
          label="School"
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
          label="Casting Time"
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
          label="Range"
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
          label="Duration"
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
          label="Verbal"
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
          label="Somatic"
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
          label="Concentration"
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
          label="Ritual"
          :value="model.ritual"
          :error-messages="errors.ritual"
          @change="(value, ack) => change('ritual', value, ack)"
        />
      </v-col>
    </v-row>
    <v-row dense>
      <v-col cols="12">
        <text-field
          label="Material"
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
          label="Target creature"
          :value="model.target"
          :options="[
            {name: 'Single Target', value: 'singleTarget'},
            {name: 'Multiple Targets', value: 'multipleTargets'},
            {name: 'Self', value: 'self'},
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
            label="Attack roll"
            :value="attackSwitch"
            @update:model-value="e => attackSwitch = e"
          />
          <computed-field
            v-else
            label="To Hit"
            prefix="1d20 + "
            hint="The bonus to attack if this action has an attack roll"
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
      label="Summary"
      hint="This will appear in the action card in the character sheet, summarise what the action does"
      :model="model.summary"
      :error-messages="errors['summary.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['summary', ...path], value, ack})"
    />
    <inline-computation-field
      label="Description"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />
    <form-sections type="spell">
      <form-section name="Resources Consumed">
        <resources-form
          :model="model.resources"
          @change="({path, value, ack}) => $emit('change', {path: ['resources', ...path], value, ack})"
          @push="({path, value, ack}) => $emit('push', {path: ['resources', ...path], value, ack})"
          @pull="({path, ack}) => $emit('pull', {path: ['resources', ...path], ack})"
        />
      </form-section>

      <form-section name="Limit Uses">
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <computed-field
              label="Uses"
              hint="How many times this action can be used before needing to be reset"
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
              label="Uses used"
              type="number"
              hint="How many times this action has already been used: should be 0 in most cases"
              style="flex-basis: 300px;"
              :value="model.usesUsed"
              :error-messages="errors.uses"
              @change="(value, ack) => change('usesUsed', value, ack)"
            />
          </v-col>
        </v-row>
        <reset-selector
          hint="When number of uses used should be reset to zero"
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
    title: 'Abjuration',
    value: 'abjuration',
  }, {
    title: 'Conjuration',
    value: 'conjuration',
  }, {
    title: 'Divination',
    value: 'divination',
  }, {
    title: 'Enchantment',
    value: 'enchantment',
  }, {
    title: 'Evocation',
    value: 'evocation',
  }, {
    title: 'Illusion',
    value: 'illusion',
  }, {
    title: 'Necromancy',
    value: 'necromancy',
  }, {
    title: 'Transmutation',
    value: 'transmutation',
  },
]);

const spellLevels = ref([
  {
    title: 'Cantrip',
    value: 0,
  }, {
    title: 'Level 1',
    value: 1,
  }, {
    title: 'Level 2',
    value: 2,
  }, {
    title: 'Level 3',
    value: 3,
  }, {
    title: 'Level 4',
    value: 4,
  }, {
    title: 'Level 5',
    value: 5,
  }, {
    title: 'Level 6',
    value: 6,
  }, {
    title: 'Level 7',
    value: 7,
  }, {
    title: 'Level 8',
    value: 8,
  }, {
    title: 'Level 9',
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
