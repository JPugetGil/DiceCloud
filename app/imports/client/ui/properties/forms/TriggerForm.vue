<template>
  <div class="trigger-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <smart-select
          label="Timing"
          style="flex-basis: 300px;"
          hint="When this trigger will fire"
          :items="timingOptions"
          :value="model.timing"
          :error-messages="errors.timing"
          @change="(value, ack) => change('timing', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-select
          label="Event"
          style="flex-basis: 300px;"
          hint="What causes this trigger to fire"
          :items="eventOptions"
          :value="model.event"
          :error-messages="errors.event"
          @change="(value, ack) => change('event', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          label="Condition"
          hint="A calculation to determine if this trigger should fire"
          placeholder="Always active"
          persistent-placeholder
          :model="model.condition"
          :error-messages="errors.condition"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['condition', ...path], value, ack})"
        />
      </v-col>
      <v-expand-transition>
        <v-col
          v-if="model.event === 'doActionProperty' || model.event === 'receiveActionProperty'"
          cols="12"
          md="6"
        >
          <smart-select
            label="Event Type"
            style="flex-basis: 300px;"
            hint="Which action event causes this trigger to fire"
            :items="actionPropertyTypeOptions"
            :value="model.actionPropertyType"
            :error-messages="errors.actionPropertyType"
            @change="(value, ack) => change('actionPropertyType', value, ack)"
          />
        </v-col>
      </v-expand-transition>
      <v-col cols="12">        
        <tag-targeting
          :model="model"
          :errors="errors"
          @change="e => $emit('change', e)"
          @push="e => $emit('push', e)"
          @pull="e => $emit('pull', e)"
        />
      </v-col>
    </v-row>

    <inline-computation-field
      class="mt-6"
      label="Description"
      hint="The rest of the description that doesn't fit in the summary goes here"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections type="trigger">
      <form-section
        name="Log"
      >
        <smart-switch
          label="Don't show in log"
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
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import InlineComputationField from '/imports/client/ui/properties/forms/shared/InlineComputationField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import TagTargeting from '/imports/client/ui/properties/forms/shared/TagTargeting.vue';
import {
  eventOptions as EVENT_OPTIONS,
  timingOptions as TIMING_OPTIONS,
  actionPropertyTypeOptions as ACTION_PROPERTY_TYPE_OPTIONS,
} from '/imports/api/properties/Triggers';

defineProps({
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

// The select items; the imported maps are { value: label }
const toItems = options => Object.keys(options).map(value => ({ value, title: options[value] }));
const eventOptions = toItems(EVENT_OPTIONS);
const timingOptions = toItems(TIMING_OPTIONS);
const actionPropertyTypeOptions = toItems(ACTION_PROPERTY_TYPE_OPTIONS);

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>
