<template>
  <div class="action-form">
    <v-row dense>
      <v-col
        cols="12"
        md="8"
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
            label="Base attack roll bonus"
            hint="Must be set for the action to have an attack roll"
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
      <v-col
        cols="12"
        md="4"
      >
        <smart-select
          label="Action type"
          :items="actionTypes"
          :value="model.actionType"
          :error-messages="errors.actionType"
          :menu-props="{auto: true, lazy: true}"
          :hint="actionTypeHints[model.actionType]"
          @change="(value, ack) => change('actionType', value, ack)"
        />
      </v-col>
    </v-row>

    <v-slide-x-transition mode="out-in">
      <text-field
        v-if="model.actionType === 'event'"
        label="Event variable name"
        :value="model.variableName"
        hint="Variable name of the event that this action represents"
        :error-messages="errors.variableName"
        @change="(value, ack) => change('variableName', value, ack)"
      />
    </v-slide-x-transition>

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

    <inline-computation-field
      label="Summary"
      hint="This will appear in the action card in the character sheet, summarise what the action does. This text will be displayed in the log when the action is taken"
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

    <form-sections type="action">
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
      <form-section name="Log">
        <smart-switch
          label="Don't show in log"
          class="ml-4 mt-0 mb-4"
          :value="model.silent"
          :error-messages="errors.silent"
          @change="(value, ack) => change('silent', value, ack)"
        />
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import ResourcesForm from '/imports/client/ui/properties/forms/ResourcesForm.vue';
import ResetSelector from '/imports/client/ui/components/ResetSelector.vue';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';

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

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}

const actionTypes = [
  {
    title: 'Action',
    value: 'action',
  }, {
    title: 'Bonus action',
    value: 'bonus',
  }, {
    title: 'Attack action',
    value: 'attack',
    help: 'Attack actions replace a single attack when you choose to use your Action to attack',
  }, {
    title: 'Reaction',
    value: 'reaction',
  }, {
    title: 'Free action',
    value: 'free',
    help: 'You can take one free action on your turn without using an action or bonus action',
  }, {
    title: 'Long action',
    value: 'long',
    help: 'Long actions take longer than one turn to complete',
  }, {
    title: 'Event',
    value: 'event',
    help: 'Events are actions that happen to the character like rests or dawn',
  },
];

const attackSwitch = ref(false);

const actionTypeHints = {};
actionTypes.forEach(type => {
  actionTypeHints[type.value] = type.help;
});

const isAttack = computed(() => {
  return attackSwitch.value || !!props.model.attackRoll?.calculation;
});
</script>

<style lang="css" scoped>
  .no-flex {
    flex: initial;
  }
  .layout.row.wrap {
    margin-right: -8px;
  }
  .layout.row.wrap > *{
    margin-right: 8px;
  }
</style>
