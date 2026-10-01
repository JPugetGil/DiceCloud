<template>
  <v-list-item
    class="ability-list-tile"
    v-on="hasClickListener ? {click} : {}"
  >
    <template #prepend>
      <check-button
        :model="model"
        ability
        shape="tile"
        class="mr-4"
      >
        <div class="d-flex flex-column align-center">
          <div class="text-headline-medium">
            <span
              v-if="swapScoresAndMods"
              :class="{'text-error font-weight-bold': model.total !== model.value}"
            >
              {{ model.value }}
            </span>
            <template v-else>
              {{ numberToSignedString(model.modifier) }}
            </template>
          </div>
          <div class="text-title-small text-medium-emphasis">
            <template v-if="swapScoresAndMods">
              {{ numberToSignedString(model.modifier) }}
            </template>
            <span
              v-else
              :class="{'text-error font-weight-bold': model.total !== model.value}"
            >
              {{ model.value }}
            </span>
          </div>
        </div>
      </check-button>
    </template>

    <v-list-item-title class="text-title-medium">
      {{ model.name }}
      <v-icon
        v-if="model.advantage > 0"
        end
        size="small"
        :aria-label="$t('common.advantage')"
      >
        mdi-chevron-double-up
      </v-icon>
      <v-icon
        v-if="model.advantage < 0"
        end
        size="small"
        :aria-label="$t('common.disadvantage')"
      >
        mdi-chevron-double-down
      </v-icon>
    </v-list-item-title>
  </v-list-item>
</template>

<script setup lang="js">
import { computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import CheckButton from '/imports/ui/properties/shared/CheckButton.vue';
import { Meteor } from 'meteor/meteor';

const props = defineProps({
  model: { type: Object, required: true },
  // The parent's @click listener, declared so that the tile knows whether it is
  // clickable: Vue keeps a declared event's listener out of $attrs.
  // `emit('click')` still calls it.
  onClick: {
    type: Function,
    default: undefined,
  },
});

const emit = defineEmits(['click']);

const hasClickListener = computed(() => !!props.onClick);

function click(e) {
  emit('click', e);
}

const swapScoresAndMods = autorun(() => {
  let user = Meteor.user();
  return user &&
    user.preferences &&
    user.preferences.swapAbilityScoresAndModifiers;
}).result;
</script>

<style lang="css" scoped>
.ability-list-tile {
  min-height: 88px;
}
</style>
