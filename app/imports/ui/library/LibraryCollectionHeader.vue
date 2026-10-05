<template>
  <div
    class="library-collection-header d-flex align-center"
    :class="isSelected && !disabled && 'text-primary'"
  >
    <!--
      The item opens the collection (role="button", from LibraryList); the
      checkbox and the buttons sit beside it, since a button may hold no other
    -->
    <v-checkbox
      v-if="selection && !singleSelect"
      class="flex-grow-0 ms-2"
      hide-details
      :disabled="disabled"
      :model-value="disabled || isSelected"
      :aria-label="model.name"
      @update:model-value="e => emit('select', e)"
      @click.stop
    />
    <v-list-item
      v-bind="$attrs"
      style="min-height: 60px; min-width: 0;"
      class="flex-1-1 font-weight-bold"
      :class="isSelected && !disabled && 'v-list-item--active'"
    >
      <template
        v-if="!selection || singleSelect"
        #prepend
      >
        <v-avatar>
          <shared-icon :model="model" />
        </v-avatar>
      </template>
      <v-list-item-title
        class="text-truncate text-no-wrap"
        style="opacity: 0.7"
      >
        {{ model.name }}
      </v-list-item-title>
      <!-- Its language and the admins' recommendation, which tell the EN and FR versions apart (UX13) -->
      <v-list-item-subtitle
        v-if="language || model.recommended"
        class="font-weight-regular"
        data-id="library-collection-language"
      >
        <template v-if="language">
          {{ $t(`languages.${language}`) }}
        </template>
        <template v-if="language && model.recommended">
          ·
        </template>
        <template v-if="model.recommended">
          <v-icon
            size="x-small"
            icon="mdi-star"
          />
          {{ $t('library.recommended') }}
        </template>
      </v-list-item-subtitle>
    </v-list-item>
    <template v-if="!selection">
      <v-btn
        v-if="canEdit"
        variant="text"
        icon
        class="flex-grow-0"
        :aria-label="$t('library.editCollection', { name: model.name })"
        @click.stop="editLibraryCollection"
      >
        <v-icon>
          mdi-pencil
        </v-icon>
      </v-btn>
      <v-btn
        variant="text"
        icon
        class="flex-grow-0"
        :aria-label="$t('library.openCollection', { name: model.name })"
        :to="{name: 'libraryCollection', params: {id: model._id}}"
        @click.stop
      >
        <v-icon>
          mdi-forward
        </v-icon>
      </v-btn>
    </template>
  </div>
</template>

<script setup lang="js">
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import { hasDocEditPermission } from '/imports/api/sharing/sharingPermissions';

import { computed } from 'vue';
import SharedIcon from '/imports/ui/components/SharedIcon.vue';
import libraryLanguage from '/imports/api/library/libraryLanguage';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const dialogStackStore = useDialogStackStore();

// The group's activator props go to the item, not the row around it
defineOptions({ inheritAttrs: false });

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  selection: Boolean,
  singleSelect: Boolean,
  isSelected: Boolean,
  disabled: Boolean,
});

const emit = defineEmits(['select']);



const canEdit = autorun(() => hasDocEditPermission(props.model, Meteor.user())).result;
const language = computed(() => libraryLanguage(props.model));

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
