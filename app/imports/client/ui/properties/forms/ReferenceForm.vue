<template>
  <div class="reference-form">
    <v-row dense>
      <v-col cols="12">
        <outlined-input
          v-ripple
          name="Linked Property"
          class="pa-4 mb-6"
          data-id="change-ref"
          style="cursor: pointer;"
          @click="changeReference"
        >
          <v-progress-circular
            v-if="linkLoading"
            indeterminate
          />
          <div
            v-else
            class="d-flex align-center"
          >
            <v-icon class="mr-4">
              mdi-vector-link
            </v-icon>
            <div class="flex-grow-1">
              <tree-node-view
                v-if="model && model.cache && model.cache.node"
                :model="model.cache.node"
              />
              <div v-else>
                {{ model.cache.node && model.cache.node.name || model.ref && model.ref.id }}
              </div>
              <div
                v-if="model.cache.library && model.cache.library.name"
                class="text-caption"
              >
                {{ model.cache.library && model.cache.library.name }}
              </div>
              <div
                v-if="model.cache.error || errors.ref"
                class="text-error"
              >
                {{ model.cache.error || errors.ref }}
              </div>
            </div>
            <v-btn
              variant="text"
              class="ml-4"
              icon
              @click.stop="updateReferenceNode"
            >
              <v-icon>
                mdi-refresh
              </v-icon>
            </v-btn>
          </div>
        </outlined-input>
      </v-col>
    </v-row>
    <form-sections
      v-if="$slots.default"
      type="reference"
    >
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import TreeNodeView from '/imports/client/ui/properties/treeNodeViews/TreeNodeView.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import OutlinedInput from '/imports/client/ui/properties/viewers/shared/OutlinedInput.vue';
import updateReferenceNodeMethod from '/imports/api/library/methods/updateReferenceNode';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const props = defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change']);

const dialogStackStore = useDialogStackStore();
const linkLoading = ref(false);

function changeReference() {
  dialogStackStore.pushDialogStack({
    component: 'select-library-node-dialog',
    elementId: 'change-ref',
    callback(node) {
      if (!node) return;
      linkLoading.value = true;
      emit('change', {
        path: ['ref'],
        value: {
          id: node._id,
          collection: 'libraryNodes',
        },
        ack() {
          linkLoading.value = false;
        },
      });
    },
  });
}

async function updateReferenceNode() {
  if (!props.model._id) return;
  linkLoading.value = true;
  try {
    await updateReferenceNodeMethod.callAsync({ _id: props.model._id });
  } catch (error) {
    console.error(error);
  } finally {
    linkLoading.value = false;
  }
}
</script>

<style lang="css" scoped>
</style>
