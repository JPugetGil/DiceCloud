<template>
  <div class="toggle-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          :label="$t('forms.variableName')"
          :value="model.variableName"
          :hint="$t('forms.variableNameAttributeHint')"
          :error-messages="errors.variableName"
          @change="(value, ack) => change('variableName', value, ack)"
        />
      </v-col>

      <v-col
        cols="12"
        md="6"
      >
        <smart-toggle
          :label="$t('forms.toggle.active')"
          :value="radioSelection"
          :options="[
            {name: $t('forms.toggle.enabled'), value: 'enabled'},
            {name: $t('forms.toggle.disabled'), value: 'disabled'},
            {name: $t('forms.toggle.calculated'), value: 'calculated'},
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
            :label="$t('forms.condition')"
            :hint="$t('forms.toggle.conditionHint')"
            :model="model.condition"
            :error-messages="errors.condition"
            @change="({path, value, ack}) =>
              $emit('change', {path: ['condition', ...path], value, ack})"
          />
        </v-col>
      </v-expand-transition>
      <v-col cols="12">
        <smart-toggle
          :label="$t('forms.toggle.enableOrDisable')"
          :value="model.targetByTags"
          :options="[
            {name: $t('forms.toggle.descendants'), value: false},
            {name: $t('forms.toggle.byTags'), value: true},
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
      <form-section :name="$t('forms.behavior')">
        <v-col
          cols="12"
          md="6"
        >
          <smart-switch
            class="ml-2"
            :label="$t('forms.toggle.showOnSheet')"
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
