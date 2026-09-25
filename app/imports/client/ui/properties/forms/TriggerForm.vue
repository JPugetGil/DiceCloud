<template>
  <div class="trigger-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <smart-select
          :label="$t('forms.trigger.timing')"
          style="flex-basis: 300px;"
          :hint="$t('forms.trigger.timingHint')"
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
          :label="$t('forms.trigger.event')"
          style="flex-basis: 300px;"
          :hint="$t('forms.trigger.eventHint')"
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
          :label="$t('forms.condition')"
          :hint="$t('forms.trigger.conditionHint')"
          :placeholder="$t('forms.alwaysActive')"
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
            :label="$t('forms.trigger.eventType')"
            style="flex-basis: 300px;"
            :hint="$t('forms.trigger.eventTypeHint')"
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
      :label="$t('common.description')"
      :hint="$t('forms.feature.descriptionHint')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections type="trigger">
      <form-section
        :name="$t('forms.log')"
      >
        <smart-switch
          :label="$t('forms.dontShowInLog')"
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
import { translateOr } from '/imports/client/ui/i18n';

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

// The select items; the imported maps are { value: English label }
const toItems = (options, group) => Object.keys(options).map(value => ({
  value,
  title: translateOr(`triggers.${group}.${value}`, options[value]),
}));
const eventOptions = toItems(EVENT_OPTIONS, 'event');
const timingOptions = toItems(TIMING_OPTIONS, 'timing');
const actionPropertyTypeOptions = toItems(ACTION_PROPERTY_TYPE_OPTIONS, 'actionPropertyType');

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>
