<template>
  <v-list-item
    style="min-height: 60px; min-width: 0;"
    class="px-0 font-weight-bold"
    :class="isSelected && !disabled && 'text-primary v-list-item--active'"
  >
    <template #prepend>
      <v-checkbox
        v-if="selection && !singleSelect"
        :disabled="disabled"
        :model-value="disabled || isSelected"
        @update:model-value="e => emit('select', e)"
        @click.stop
      />
      <v-avatar v-else>
        <shared-icon :model="model" />
      </v-avatar>
    </template>
    <v-list-item-title class="d-flex align-center">
      <div
        class="text-truncate text-no-wrap"
        style="opacity: 0.7"
      >
        {{ model.name }}
      </div>
      <template v-if="!selection && !dense">
        <v-spacer />
        <v-btn
          v-if="canEdit"
          variant="text"
          icon
          style="flex-grow: 0"
          @click.stop="editLibraryCollection"
        >
          <v-icon>
            mdi-pencil
          </v-icon>
        </v-btn>
        <v-btn
          variant="text"
          icon
          style="flex-grow: 0"
          :to="{name: 'libraryCollection', params: {id: model._id}}"
          @click.stop
        >
          <v-icon>
            mdi-forward
          </v-icon>
        </v-btn>
      </template>
    </v-list-item-title>
  </v-list-item>
</template>

<script setup lang="js">
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import { hasDocEditPermission } from '/imports/api/sharing/sharingPermissions';

import SharedIcon from '/imports/client/ui/components/SharedIcon.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  open: Boolean,
  selection: Boolean,
  singleSelect: Boolean,
  dense: Boolean,
  isSelected: Boolean,
  disabled: Boolean,
});

const emit = defineEmits(['select']);



const canEdit = autorun(() => hasDocEditPermission(props.model, Meteor.user())).result;

function editLibraryCollection() {
  dialogStackStore.pushDialogStack({
    data: { _id: props.model._id},
    component: 'library-collection-edit-dialog',
    elementId: `library-collection-${props.model._id}`,
  });
}
</script>

<style lang="css" scoped>
</style>
