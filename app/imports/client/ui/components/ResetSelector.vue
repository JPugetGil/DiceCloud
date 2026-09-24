<template>
  <smart-select
    label="Reset"
    clearable
    style="flex-basis: 300px;"
    :hint="hint"
    :items="resetOptions"
    :value="value"
    :error-messages="errorMessages"
    :menu-props="{auto: true, lazy: true}"
    @change="(value, ack) => $emit('change', value, ack)"
  />
</template>

<script setup lang="js">
import { autorun } from 'vue-meteor-tracker';
import createListOfProperties from '/imports/client/ui/properties/forms/shared/lists/createListOfProperties';

defineProps({
  value: {
    type: [String, Number, Date, Array, Object, Boolean],
    default: undefined,
  },
  errorMessages: {
    type: [String, Array],
    default: undefined,
  },
  hint: {
    type: String,
    default: undefined,
  }
});

defineEmits(['change']);

const resetOptions = autorun(() => {
  const eventActions = createListOfProperties({
    type: 'action',
    actionType: 'event',
  }, true);
  const defaultEvents = [
    {
      title: 'Short rest',
      value: 'shortRest',
    }, {
      title: 'Long rest',
      value: 'longRest',
    }
  ];
  return [...defaultEvents, ...eventActions];
}).result;
</script>
