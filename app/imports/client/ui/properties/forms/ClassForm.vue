<template>
  <div class="class-form">
    <v-row dense>
      <v-col
        cols="12"
      >
        <text-field
          :label="$t('forms.variableName')"
          :value="model.variableName"
          :hint="$t('forms.class.variableNameHint')"
          :error-messages="errors.variableName"
          @change="(value, ack) => change('variableName', value, ack)"
        />
      </v-col>
    </v-row>

    <inline-computation-field
      :label="$t('common.description')"
      :model="model.description"
      :error-messages="errors['description.text']"
      @change="({path, value, ack}) =>
        $emit('change', {path: ['description', ...path], value, ack})"
    />

    <form-sections type="class">
      <form-section :name="$t('forms.class.levelsFromLibraries')">
        <tag-targeting
          :model="model"
          :errors="errors"
          tag-field="slotTags"
          :tag-hint="$t('forms.class.tagHint')"
          :or-hint="$t('forms.class.orHint')"
          :not-hint="$t('forms.class.notHint')"
          @change="e => $emit('change', e)"
          @push="e => $emit('push', e)"
          @pull="e => $emit('pull', e)"
        />

        <computed-field
          :label="$t('forms.class.activeCondition')"
          :hint="$t('forms.class.activeConditionHint')"
          :placeholder="$t('forms.alwaysActive')"
          :model="model.slotCondition"
          :error-messages="errors.slotCondition"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['slotCondition', ...path], value, ack})"
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

defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
  classForm: Boolean,
});

const emit = defineEmits(['change', 'push', 'pull']);

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>
