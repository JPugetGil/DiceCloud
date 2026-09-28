<template>
  <v-toolbar
    :color="color || 'secondary'"
    :theme="isDark ? 'dark' : 'light'"
    :flat="flat"
  >
    <v-btn
      v-if="!embedded"
      variant="text"
      icon
      @click="back"
    >
      <v-icon>mdi-arrow-left</v-icon>
    </v-btn>
    <property-icon
      :model="model"
      class="mr-2"
    />
    <v-toolbar-title v-if="model">
      {{ title }}
    </v-toolbar-title>
    <v-spacer />
    <v-slide-y-transition
      hide-on-leave
    >
      <div
        v-if="editing && model"
        key="edit-buttons"
        class="d-flex"
        style="flex: 1 0 auto;"
      >
        <v-spacer />
        <v-menu
          v-if="
            $attrs.onMove ||
              $attrs.onDuplicate ||
              $attrs.onRemove
          "
          location="bottom left"

          transition="slide-y-transition"
        >
          <template #activator="{ props: activatorProps }">
            <v-btn
              variant="text"
              icon
              data-id="property-toolbar-menu-button"
              v-bind="activatorProps"
            >
              <v-icon>mdi-dots-vertical</v-icon>
            </v-btn>
          </template>
          <v-list>
            <v-list-item
              v-if="docsPath"
              @click="helpDialog"
            >
              <v-list-item-title>
                {{ $t('common.help') }}
              </v-list-item-title>

              <template #append>
                <v-icon>mdi-help</v-icon>
              </template>
            </v-list-item>
            <v-list-item
              v-if="$attrs.onDuplicate"
              :disabled="context.editPermission === false"
              @click="$emit('duplicate')"
            >
              <v-list-item-title>
                {{ $t('toolbar.duplicate') }}
              </v-list-item-title>

              <template #append>
                <v-icon>mdi-content-copy</v-icon>
              </template>
            </v-list-item>
            <v-list-item
              v-if="$attrs.onCopy"
              :disabled="context.copyPermission === false"
              @click="$emit('copy')"
            >
              <v-list-item-title>
                {{ $t('toolbar.copyTo') }}
              </v-list-item-title>

              <template #append>
                <v-icon>mdi-content-duplicate</v-icon>
              </template>
            </v-list-item>
            <v-list-item
              v-if="$attrs.onMakeReference"
              :disabled="context.editPermission === false"
              @click="$emit('make-reference')"
            >
              <v-list-item-title>
                {{ $t('toolbar.createReference') }}
              </v-list-item-title>

              <template #append>
                <v-icon>mdi-link-plus</v-icon>
              </template>
            </v-list-item>
            <v-list-item
              v-if="$attrs.onMove"
              :disabled="context.editPermission === false"
              @click="$emit('move')"
            >
              <v-list-item-title>
                {{ $t('toolbar.move') }}
              </v-list-item-title>

              <template #append>
                <v-icon>mdi-send</v-icon>
              </template>
            </v-list-item>
            <v-list-item
              v-if="$attrs.onCopyToLibrary"
              :disabled="context.editPermission === false"
              @click="$emit('copy-to-library')"
            >
              <v-list-item-title>
                {{ $t('toolbar.copyToLibrary') }}
              </v-list-item-title>

              <template #append>
                <v-icon>mdi-content-duplicate</v-icon>
              </template>
            </v-list-item>
            <v-list-item
              v-if="$attrs.onRemove"
              :disabled="context.editPermission === false"
              @click="$emit('remove')"
            >
              <v-list-item-title>
                {{ $t('common.delete') }}
              </v-list-item-title>

              <template #append>
                <v-icon>mdi-delete</v-icon>
              </template>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
      <div
        v-else
        key="blank"
        class="d-flex flex-1-1"
      />
    </v-slide-y-transition>
    <v-btn
      tile
      variant="outlined"
      @click="$emit('toggle-editing')"
    >
      <span style="width: 44px;">
        {{ editing ? $t('common.done') : $t('common.edit') }}
      </span>
      <v-slide-y-transition
        hide-on-leave
      >
        <v-icon
          v-if="editing"
          key="doneIcon"
          end
        >
          mdi-check
        </v-icon>
        <v-icon
          v-else
          key="createIcon"
          end
        >
          mdi-pencil
        </v-icon>
      </v-slide-y-transition>
    </v-btn>
  </v-toolbar>
</template>

<script setup>
import { computed, inject } from 'vue';
import isDarkColor from '/imports/client/ui/utility/isDarkColor';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';
import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import getThemeColor from '/imports/client/ui/utility/getThemeColor';
import PROPERTIES from '/imports/constants/PROPERTIES';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: Object,
    default: undefined,
  },
  flat: Boolean,
  editing: Boolean,
  embedded: Boolean,
});

defineEmits(['color-changed', 'duplicate', 'copy', 'make-reference', 'move', 'copy-to-library', 'remove', 'toggle-editing']);

const context = inject('context', {});

const isDark = computed(() => isDarkColor(color.value));

const color = computed(() => {
  return (props.model && props.model.color) || getThemeColor('secondary');
});

const title = computed(() => {
  let model = props.model;
  if (!model) return '';
  if (model.quantity !== 1 && model.quantity !== undefined) {
    if (model.plural) {
      return `${model.quantity} ${model.plural}`;
    } else if (model.name) {
      return `${model.quantity} ${model.name}`;
    } else {
      return `${model.quantity} × ${getPropertyName(model.type)}`;
    }
  }
  return model.name || getPropertyName(model.type);
});

const docsPath = computed(() => {
  if (!props.model) return undefined;
  const propDef = PROPERTIES[props.model.type];
  return propDef && propDef.docsPath;
});


function back() {
  dialogStackStore.popDialogStack();
}

function helpDialog() {
  dialogStackStore.pushDialogStack({
    component: 'help-dialog',
    elementId: 'property-toolbar-menu-button',
    data: {
      path: docsPath.value,
    },
  });
}
</script>

<style lang="css" scoped>
</style>
