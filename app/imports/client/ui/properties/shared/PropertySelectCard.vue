<template>
  <v-card
    hover
    style="height: 100%; overflow: hidden;"
    :class="{'text-accent': disabled}"
    :disabled="disabled"
    @click="e => emit('click', e)"
  >
    <v-card-title
      class="subtitle pb-3"
      style="text-align: center;"
    >
      <v-avatar tile>
        <v-icon size="x-large">
          {{ property.icon }}
        </v-icon>
      </v-avatar>
      <span class="ml-3">
        {{ getPropertyName(type) || property.name }}
      </span>
    </v-card-title>
    <v-expand-transition>
      <div
        v-if="showPropertyHelp"
        class="mx-4"
      >
        {{ getPropertyHelpText(type) || property.helpText }}
        <div style="height: 16px;" />
        <div
          v-if="property.examples"
          class="text-caption"
        >
          {{ property.examples }}
          <div style="height: 16px;" />
        </div>
      </div>
    </v-expand-transition>
  </v-card>
</template>

<script setup>
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import { getPropertyName, getPropertyHelpText } from '/imports/client/ui/i18n/propertyNames';

defineProps({
  property: {
    type: Object,
    required: true,
  },
  // The property type, for its name and help in the interface's language
  type: {
    type: String,
    default: undefined,
  },
  disabled: Boolean,
});

const emit = defineEmits(['click']);

const showPropertyHelp = autorun(() => {
  const user = Meteor.user();
  return !(user?.preferences?.hidePropertySelectDialogHelp);
}).result;
</script>

<style lang="css" scoped>
</style>
