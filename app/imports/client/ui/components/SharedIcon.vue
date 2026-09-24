<template>
  <v-tooltip
    v-if="accessRights === 'reader' || accessRights === 'writer' || accessRights === 'public'"
    location="bottom"
  >
    <template #activator="{ props: activatorProps }">
      <v-icon
        style="opacity: 0.4"
        v-bind="activatorProps"
      >
        {{ accessIcon }}
      </v-icon>
    </template>
    <span>{{ accessText }}</span>
  </v-tooltip>
</template>

<script setup>
import { computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const accessRights = autorun(() => {
  let userId = Meteor.userId();
  if (props.model.owner === userId) return 'owner';
  else if (props.model.writers?.includes(userId)) return 'writer';
  else if (props.model.readers?.includes(userId)) return 'reader';
  else if (props.model.public) return 'public';
  else return 'denied';
}).result;

const accessIcon = computed(() => {
  switch (accessRights.value) {
    case 'writer': return 'mdi-file-edit';
    case 'reader': return 'mdi-file-eye';
    case 'public': return 'mdi-cloud';
    default: return '';
  }
});

const accessText = computed(() => {
  switch (accessRights.value) {
    case 'writer': return 'Shared with edit permission';
    case 'reader': return 'Shared as view-only';
    case 'public': return 'Shared publically';
    default: return '';
  }
});
</script>

<style lang="css" scoped>
</style>
