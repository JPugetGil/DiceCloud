<template>
  <div class="saving-throw-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          label="DC"
          hint="Saving throw DC"
          :model="model.dc"
          :error-messages="errors.dc"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['dc', ...path], value, ack})"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-combobox
          label="Save"
          hint="Which stat the saving throw targets"
          :value="model.stat"
          :items="saveList"
          :error-messages="errors.stat"
          @change="(...args) => change('stat', ...args)"
        />
      </v-col>
      <v-col
        cols="12"
      >
        <smart-toggle
          label="Target creature"
          :value="model.target"
          :options="[
            {name: 'Action Target', value: 'target'},
            {name: 'Self', value: 'self'},
          ]"
          :error-messages="errors.target"
          @change="(...args) => change('target', ...args)"
        />
      </v-col>
    </v-row>
    <form-sections type="savingThrow">
      <form-section name="Log">
        <smart-switch
          label="Don't show in log"
          :value="model.silent"
          :error-messages="errors.silent"
          @change="(...args) => change('silent', ...args)"
        />
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { useSaveList } from '/imports/client/ui/properties/forms/shared/lists/useSaveList';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
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

const emit = defineEmits(['change']);

function change(path, value, ack) {
  emit('change', { path: [path], value, ack });
}

const saveList = useSaveList();
</script>
