<template>
  <div class="adjustment-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <smart-combobox
          label="Attribute"
          hint="The attribute that will be damaged or healed"
          style="flex-basis: 300px;"
          :items="attributeList"
          :value="model.stat"
          :error-messages="errors.stat"
          @change="(value, ack) => change('stat', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <computed-field
          label="Amount"
          :hint="model.operation === 'set' ? setHint : damageHint"
          :model="model.amount"
          :error-messages="errors.amount"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['amount', ...path], value, ack})"
        />
      </v-col>
    </v-row>
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <smart-toggle
          label="Operation"
          hint="Should the attribute be damaged by the amount, or set to the amount"
          :value="model.operation"
          :options="[
            { name: 'Damage', value: 'increment' },
            { name: 'Set', value: 'set' },
          ]"
          :error-messages="errors.operation"
          @change="(value, ack) => change('operation', value, ack)"
        />
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <smart-toggle
          label="Target creature"
          :value="model.target"
          :options="[
            {name: 'Action Target', value: 'target'},
            {name: 'Self', value: 'self'},
          ]"
          :error-messages="errors.target"
          @change="(value, ack) => change('target', value, ack)"
        />
      </v-col>
    </v-row>
    <form-sections type="adjustment">
      <form-section name="Log">
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
import { useAttributeList } from '/imports/client/ui/properties/forms/shared/lists/useAttributeList';
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

const attributeList = useAttributeList();

const damageHint = 'The amount of damage to apply, negative values will heal';
const setHint = 'The value to set the stat to';

function change(field, value, ack) {
  emit('change', { path: [field], value, ack });
}
</script>

<style lang="css" scoped>

</style>
