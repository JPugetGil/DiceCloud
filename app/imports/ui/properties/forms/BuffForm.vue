<template>
  <div class="buff-form">
    <inline-computation-field
      :label="$t('common.description')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <smart-toggle
      v-if="!model.applied"
      :label="$t('forms.targetCreature')"
      :model-value="model.target"
      :options="[
        {name: $t('forms.actionTarget'), value: 'target'},
        {name: $t('forms.self'), value: 'self'},
      ]"
      :error-messages="errors.target"
      @change="(value, ack) => change('target', value, ack)"
    />
    <form-sections type="buff">
      <form-section
        v-if="$slots.children"
        :name="$t('forms.children')"
        standalone
      >
        <slot name="children" />
      </form-section>
      <!-- How long it lasts, which a party's initiative tracker counts down,
        and on whose turns (phase 3.5): "until the end of the caster's next
        turn" is 1 round, at the end, on the turns of who applied it -->
      <form-section :name="$t('forms.buff.durationSection')">
        <computed-field
          :label="$t('forms.buff.duration')"
          :hint="$t('forms.buff.durationHint')"
          :model="model.duration"
          :error-messages="errors.duration"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['duration', ...path], value, ack})"
        />
        <v-row density="compact">
          <v-col
            cols="12"
            md="6"
          >
            <smart-toggle
              :label="$t('forms.buff.durationEvent')"
              :model-value="model.durationEvent || 'turnStart'"
              :options="[
                {name: $t('forms.buff.turnStart'), value: 'turnStart'},
                {name: $t('forms.buff.turnEnd'), value: 'turnEnd'},
              ]"
              :error-messages="errors.durationEvent"
              data-id="buff-duration-event"
              @change="(value, ack) => change('durationEvent', value, ack)"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <smart-toggle
              :label="$t('forms.buff.durationAnchor')"
              :model-value="model.durationAnchor || 'holder'"
              :options="[
                {name: $t('forms.buff.anchorHolder'), value: 'holder'},
                {name: $t('forms.buff.anchorSource'), value: 'source'},
              ]"
              :error-messages="errors.durationAnchor"
              data-id="buff-duration-anchor"
              @change="(value, ack) => change('durationAnchor', value, ack)"
            />
          </v-col>
        </v-row>
      </form-section>
      <form-section :name="$t('forms.behavior')">
        <v-row density="compact">
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <smart-switch
              :label="$t('forms.buff.hideRemoveButton')"
              :model-value="model.hideRemoveButton"
              :error-messages="errors.hideRemoveButton"
              @change="(value, ack) => change('hideRemoveButton', value, ack)"
            />
          </v-col>
          <v-col
            cols="12"
            sm="6"
            md="4"
          >
            <smart-switch
              :label="$t('forms.buff.dontFreeze')"
              :model-value="model.skipCrystalization"
              :error-messages="errors.skipCrystalization"
              @change="(value, ack) => change('skipCrystalization', value, ack)"
            />
          </v-col>
        </v-row>
      </form-section>
      <form-section :name="$t('forms.log')">
        <smart-switch
          :label="$t('forms.dontShowInLog')"
          :model-value="model.silent"
          :error-messages="errors.silent"
          @change="(value, ack) => change('silent', value, ack)"
        />
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import InlineComputationField from '/imports/ui/properties/forms/shared/InlineComputationField.vue';
import ComputedField from '/imports/ui/properties/forms/shared/ComputedField.vue';
import FormSection from '/imports/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/ui/properties/forms/shared/FormSections.vue';

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

const emit = defineEmits(['change']);

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>

<style lang="css" scoped>

</style>
