<template>
  <div class="proficiency-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <proficiency-select
          label="Proficiency"
          style="flex-basis: 300px;"
          :clearable="false"
          :value="model.value"
          @change="(value, ack) => change('value', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-toggle
          label="Target properties"
          :value="model.targetByTags ? 'tags' : 'skills'"
          :options="[
            {name: 'Target by variable name', value: 'skills'},
            {name: 'Target by tags', value: 'tags'},
          ]"
          @change="(val, ack) => {
            if (val === 'skills') val = undefined;
            if (val === 'tags') val = true;
            change('targetByTags', val, ack);
          }"
        />
      </v-col>
      <v-col
        cols="12"
      >
        <v-slide-y-transition hide-on-leave>
          <tag-targeting
            v-if="model.targetByTags"
            :model="model"
            :errors="errors"
            @change="e => $emit('change', e)"
            @push="e => $emit('push', e)"
            @pull="e => $emit('pull', e)"
          />
          <smart-combobox
            v-else
            label="Skills"
            class="mr-2"
            multiple
            small-chips
            deletable-chips
            hint="Which skills does this proficiency apply to"
            :value="model.stats"
            :items="skillList"
            :error-messages="errors.stats"
            @change="(value, ack) => change('stats', value, ack)"
          />
        </v-slide-y-transition>
      </v-col>
      <v-expand-transition>
        <v-col
          v-if="model.targetByTags"
          cols="12"
        >
          <text-field
            label="Target field"
            :value="model.targetField"
            hint="Target a specific calculation field on the affected properties"
            placeholder="Default field"
            persistent-placeholder
            :error-messages="errors.targetField"
            @change="(value, ack) => change('targetField', value, ack)"
          />
        </v-col>
      </v-expand-transition>
    </v-row>
    <form-sections
      v-if="$slots.default"
      type="proficiency"
    >
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import ProficiencySelect from '/imports/client/ui/properties/forms/shared/ProficiencySelect.vue';
import TagTargeting from '/imports/client/ui/properties/forms/shared/TagTargeting.vue';
import { useSkillList } from '/imports/client/ui/properties/forms/shared/lists/useSkillList';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change', 'push', 'pull']);

const skillList = useSkillList();

const change = (field, value, ack) => {
  emit('change', { [field]: value });
  if (typeof ack === 'function') {
    ack();
  }
};
</script>

<style lang="css" scoped>

</style>
