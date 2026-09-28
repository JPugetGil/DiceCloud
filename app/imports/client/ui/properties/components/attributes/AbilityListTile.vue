<template>
  <v-list-item
    class="ability-list-tile pl-0"
    v-on="hasClickListener ? {click} : {}"
  >
    <template #prepend>
      <div
        class="ma-0"
        style="min-width: 40px;"
      >
        <v-btn
          class="mr-4 py-2"
          variant="text"
          height="82"
          :data-id="`check-btn-${model._id}`"
          :loading="checkLoading"
          :disabled="!context.editPermission"
          @click.stop="check"
        >
          <div>
            <div class="text-h4 mod">
              <template v-if="swapScoresAndMods">
                <span :class="{'text-primary': model.total !== model.value}">
                  {{ model.value }}
                </span>
              </template>
              <template v-else>
                {{ numberToSignedString(model.modifier) }}
              </template>
            </div>
            <div class="text-h6 value">
              <template v-if="swapScoresAndMods">
                {{ numberToSignedString(model.modifier) }}
              </template>
              <template v-else>
                <span :class="{'text-primary': model.total !== model.value}">
                  {{ model.value }}
                </span>
              </template>
            </div>
          </div>
        </v-btn>
      </div>
    </template>


    <v-list-item-title>
      {{ model.name }}
      <v-icon
        v-if="model.advantage > 0"
        end
      >
        mdi-chevron-double-up
      </v-icon>
      <v-icon
        v-if="model.advantage < 0"
        end
      >
        mdi-chevron-double-down
      </v-icon>
    </v-list-item-title>
  </v-list-item>
</template>

<script setup lang="js">
import { inject, ref, computed, useAttrs } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import doAction from '/imports/client/ui/creature/actions/doAction';

const props = defineProps({
  model: { type: Object, required: true },
});

const emit = defineEmits(['click']);

const context = inject('context', {});
const attrs = useAttrs();

const checkLoading = ref(false);

const hasClickListener = computed(() => !!attrs.onClick);

function click(e) {
  emit('click', e);
}

async function check() {
  checkLoading.value = true;
  await doAction({
    creatureId: props.model.root.id,
    elementId: `check-btn-${props.model._id}`,
    task: {
      subtaskFn: 'check',
      targetIds: [props.model.root.id],
      advantage: props.model.advantage,
      skillVariableName: undefined,
      abilityVariableName: props.model.variableName,
      dc: null,
    },
  }).catch(error => {
    snackbar({ text: error.reason || error.message || error.toString() });
    console.error(error);
  }).finally(() => {
    checkLoading.value = false;
  });
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
  background: inherit;
  min-height: 88px;
}

.value {
  font-weight: 600;
  font-size: 24px !important;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mod,
.value {
  text-align: center;
  width: 100%;
  min-width: 42px;
}
</style>
