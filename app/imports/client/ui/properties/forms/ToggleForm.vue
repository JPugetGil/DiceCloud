<template>
  <div class="toggle-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          label="Variable name"
          :value="model.variableName"
          hint="Use this name in calculations to reference this attribute"
          :error-messages="errors.variableName"
          @change="(value, ack) => change('variableName', value, ack)"
        />
      </v-col>

      <v-col
        cols="12"
        md="6"
      >
        <smart-toggle
          label="Active"
          :value="radioSelection"
          :options="[
            {name: 'Enabled', value: 'enabled'},
            {name: 'Disabled', value: 'disabled'},
            {name: 'Calculated', value: 'calculated'},
          ]"
          :error-messages="errors.enabled"
          @change="radioChange"
        />
      </v-col>
      <v-expand-transition>
        <v-col
          v-show="radioSelection === 'calculated'"
          cols="12"
        >
          <computed-field
            label="Condition"
            hint="When this calculation returns a value that isn't false or zero the children will be active"
            :model="model.condition"
            :error-messages="errors.condition"
            @change="({path, value, ack}) =>
              $emit('change', {path: ['condition', ...path], value, ack})"
          />
        </v-col>
      </v-expand-transition>
      <v-col cols="12">
        <smart-toggle
          label="Enabled or disable properties"
          :value="model.targetByTags"
          :options="[
            {name: 'Descendants', value: false},
            {name: 'By target tags', value: true},
          ]"
          @change="(value, ack) => change('targetByTags', value, ack)"
        />
      </v-col>
      <v-col cols="12">
        <v-expand-transition>
          <tag-targeting
            v-if="model.targetByTags"
            :model="model"
            :errors="errors"
            @change="e => $emit('change', e)"
            @push="e => $emit('push', e)"
            @pull="e => $emit('pull', e)"
          />
        </v-expand-transition>
      </v-col>
    </v-row>

    <form-sections type="toggle">
      <form-section name="Behavior">
        <v-col
          cols="12"
          md="6"
        >
          <smart-switch
            class="ml-2"
            label="Show on character sheet"
            :value="model.showUI"
            :error-messages="errors.showUI"
            @change="(value, ack) => change('showUI', value, ack)"
          />
        </v-col>
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import TagTargeting from '/imports/client/ui/properties/forms/shared/TagTargeting.vue';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
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

const radioSelection = computed(() => {
  if (props.model.disabled) {
    return 'disabled';
  } else if (props.model.enabled) {
    return 'enabled'
  } else {
    return 'calculated';
  }
});

function radioChange(value, ack) {
  if (value === 'enabled') {
    emit('change', { path: ['enabled'], value: true, ack });
    emit('change', { path: ['disabled'], value: false, ack });
  } else if (value === 'disabled') {
    emit('change', { path: ['disabled'], value: true, ack });
    emit('change', { path: ['enabled'], value: false, ack });
  } else if (value === 'calculated') {
    emit('change', { path: ['disabled'], value: false, ack });
    emit('change', { path: ['enabled'], value: false, ack });
  }
}

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>

<style lang="css" scoped>

</style>
