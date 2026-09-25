<template>
  <smart-select
    :label="$t('common.reset')"
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
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
      title: t('common.shortRest'),
      value: 'shortRest',
    }, {
      title: t('common.longRest'),
      value: 'longRest',
    }
  ];
  return [...defaultEvents, ...eventActions];
}).result;
</script>
