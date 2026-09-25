<template>
  <div
    :class="{
      'v-theme--dark': theme.isDark,
      'v-theme--light': !theme.isDark,
    }"
  >
    <v-menu
      v-if="context.creatureId"
      transition="slide-y-transition"
      :disabled="!context.editPermission"
    >
      <template #activator="{ props: activatorProps }">
        <div
          class="d-flex flex-1-1 align-center justify-start px-2"
          style="height: 100%;"
          :class="{
            'text-error': insufficient,
            'clickable': context.creatureId && context.editPermission,
          }"
          v-bind="activatorProps"
        >
          <svg-icon
            v-if="model.itemIcon"
            class="mr-2"
            :shape="model.itemIcon.shape"
            :color="model.itemColor"
          />
          <div
            v-if="quantity !== 1"
            class="mr-2 text-no-wrap"
            style="min-width: 24px; text-align: center;"
          >
            {{ quantity }}
          </div>
          <template v-if="model.itemId">
            <div
              class="text-no-wrap text-truncate"
            >
              {{ model.itemName }}
            </div>
            <div
              v-if="(typeof model.available) == 'number'"
              class="text-disabled text-no-wrap text-truncate ml-1 flex-shrink-0"
            >
              ({{ model.available }})
            </div>
          </template>
          <div
            v-else
            class="text-error text-no-wrap text-truncate flex-1-1"
          >
            {{ $t('cards.selectItem') }}
          </div>
          <v-icon
            v-if="context.editPermission"
            style="overflow: hidden;"
          >
            mdi-menu-down
          </v-icon>
        </div>
      </template>
      <select-item-to-consume
        :action="action"
        :item-consumed="model"
      />
    </v-menu>
    <div
      v-else
      class="d-flex flex-1-1 align-center justify-start"
    >
      <div
        class="mr-2"
        style="width: 24px; text-align: center;"
      >
        {{ quantity }}
      </div>
      <div
        class="text-no-wrap text-truncate"
      >
        [{{ model.tag }}]
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue';
import SelectItemToConsume from '/imports/client/ui/properties/components/actions/SelectItemToConsume.vue';
import useThemeState from '/imports/client/ui/utility/useThemeState';

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  action: {
    type: Object,
    required: true,
  },
});

const context = inject('context', {});
const theme = useThemeState();

const quantity = computed(() => {
  return props.model.quantity && props.model.quantity.value || 0;
});

const insufficient = computed(() => {
  return quantity.value > props.model.available;
});
</script>

<style lang="css" scoped>
.clickable {
  cursor: pointer;
}
.v-theme--light .clickable:hover {
  background: rgba(0,0,0,.04);
}
.v-theme--dark .clickable:hover {
  background: hsla(0,0%,100%,.08);
}
</style>
