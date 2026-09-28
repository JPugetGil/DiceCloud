<template>
  <transition-group name="slide">
    <dialog-base
      v-show="!model"
      key="left"
      class="step-1"
    >
      <template #toolbar>
        <v-toolbar-title>
          {{ $t('selector.propertyType') }}
        </v-toolbar-title>
        <v-spacer />
        <v-switch
          :model-value="showPropertyHelp"
          append-icon="mdi-help"
          hide-details
          flat
          @update:model-value="propertyHelpChanged"
        />
      </template>
      <template #unwrapped-content>
        <property-selector
          :no-library-only-props="noLibraryOnlyProps"
          :parent-type="parentType"
          @select="type => model = type"
        />
      </template>
    </dialog-base>
    <div
      v-show="model"
      key="right"
      class="step-2"
      style="height: 100%;"
    >
      <slot />
    </div>
  </transition-group>
</template>

<script setup>
import { autorun } from 'vue-meteor-tracker';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import PropertySelector from '/imports/ui/properties/shared/PropertySelector.vue';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { Meteor } from 'meteor/meteor';

defineProps({
  noLibraryOnlyProps: Boolean,
  parentType: {
    type: String,
    default: undefined,
  },
});

// The selected property type
const model = defineModel({
  type: String,
  default: undefined,
});

const showPropertyHelp = autorun(() => {
  let user = Meteor.user();
  return !(user?.preferences?.hidePropertySelectDialogHelp);
}).result;

async function propertyHelpChanged(value) {
  try {
    await Meteor.users.setPreference.callAsync({
      preference: 'hidePropertySelectDialogHelp',
      value: !value
    });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason });
  }
}
</script>

<style lang="css" scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform .3s ease;
}

.slide-enter-active.step-1,
.slide-leave-active.step-1 {
  position: absolute;
}

.slide-enter-from.step-1,
.slide-leave-to.step-1 {
  transform: translateX(-100%);
}

.slide-enter-from.step-2,
.slide-leave-to.step-2 {
  transform: translateX(100%);
}
</style>
