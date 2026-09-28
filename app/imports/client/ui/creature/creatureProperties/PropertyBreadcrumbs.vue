<template>
  <div
    class="breadcrumbs d-flex flex-1-1 align-center flex-wrap"
    :class="{'no-icons': noIcons}"
  >
    <span
      v-if="noLinks || embedded || collection !== 'creatureProperties'"
    >
      <v-icon v-if="collection === 'creatureProperties'">
        mdi-account
      </v-icon>
      <v-icon v-else-if="collection === 'libraryNodes'">
        mdi-book-open-blank-variant
      </v-icon>
    </span>
    <a
      v-else
      data-id="breadcrumb-root"
      @click="clickRootCreature"
    >
      <v-icon color="accent">
        mdi-account
      </v-icon>
    </a>
    <template
      v-for="prop in breadcrumbs"
      :key="prop._id"
    >
      <v-icon>
        mdi-chevron-right
      </v-icon>
      <span
        v-if="noLinks"
      >
        <tree-node-view
          :model="prop"
          class="breadcrumb-tree-node-view"
        />
      </span>
      <a
        v-else
        :data-id="`breadcrumb-${prop._id}`"
        @click="click(prop._id)"
      >
        <tree-node-view
          :model="prop"
          class="breadcrumb-tree-node-view"
        />
      </a>
    </template>
  </div>
</template>

<script setup lang="js">
import { computed } from 'vue';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import TreeNodeView from '/imports/client/ui/properties/treeNodeViews/TreeNodeView.vue';
import { Mongo } from 'meteor/mongo';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  collection: {
    type: String,
    default: 'creatureProperties',
  },
  noLinks: Boolean,
  noIcons: Boolean,
  editing: Boolean,
  embedded: Boolean,
});

const emit = defineEmits(['select-sub-property']);


const breadcrumbs = computed(() => {
  return Mongo.Collection.get(props.collection).find({
    ...getFilter.ancestors(props.model),
    ...(props.collection === 'creatureProperties' && { type: { $ne: 'propertySlot' } })
  }).fetch();
});

function click(id) {
  if (props.embedded) {
    emit('select-sub-property', id);
    return;
  }
  
  // Check if there is a dialog open for this doc already
  let dialogFound;
  let dialogsToPop = 0;
  dialogStackStore.dialogs.forEach(dialog => {
    if (dialog.data && dialog.data._id === id) {
      dialogFound = true;
      dialogsToPop = 0;
    } else {
      dialogsToPop += 1;
    }
  });
  
  if (dialogFound) {
    // Pop dialogs until we get to it
    dialogStackStore.popDialogStacks(dialogsToPop);
  } else {
    const component = props.collection === 'creatureProperties' ? 'creature-property-dialog'
      : props.collection === 'libraryNodes' ? 'library-node-dialog'
      : undefined;
    // Otherwise open it as a new dialog
    dialogStackStore.pushDialogStack({
      component,
      elementId: `breadcrumb-${id}`,
      data: {
        _id: id,
        startInEditTab: props.editing,
      },
    });
  }
}

function clickRootCreature() {
  // Check if there is a dialog open for this doc already
  let dialogFound;
  let dialogsToPop = 0;
  dialogStackStore.dialogs.forEach(dialog => {
    if (dialog.component === 'creature-root-dialog') {
      dialogFound = true;
      dialogsToPop = 0;
    } else {
      dialogsToPop += 1;
    }
  });
  
  if (dialogFound) {
    // Pop dialogs until we get to it
    dialogStackStore.popDialogStacks(dialogsToPop);
  } else {
    // Otherwise open it as a new dialog
    dialogStackStore.pushDialogStack({
      component: 'creature-root-dialog',
      elementId: 'breadcrumb-root',
      data: {
        _id: props.model.root.id,
        startInEditTab: props.editing,
      },
    });
  }
}
</script>

<style lang="css" scoped>
.breadcrumbs {
  margin-bottom: 16px;
  opacity: 0.8;
}
</style>

<style lang="css">
  .no-icons .breadcrumb-tree-node-view .v-icon {
    display: none;
  }
</style>
