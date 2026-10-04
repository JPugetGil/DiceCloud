<template>
  <div class="d-flex flex-wrap ga-2">
    <v-btn
      variant="tonal"
      prepend-icon="mdi-star-plus-outline"
      :disabled="!editableMembers.length || !!resting"
      data-id="party-give-xp"
      @click="giveExperience"
    >
      {{ $t('party.giveExperience') }}
    </v-btn>
    <v-menu>
      <template #activator="{ props: menuProps }">
        <v-btn
          v-bind="menuProps"
          variant="tonal"
          prepend-icon="mdi-campfire"
          append-icon="mdi-menu-down"
          :loading="!!resting"
          :disabled="!editableMembers.length"
          data-id="party-rest"
        >
          {{ $t('party.rest') }}
        </v-btn>
      </template>
      <v-list>
        <v-list-item
          v-for="type in REST_TYPES"
          :key="type"
          :prepend-icon="type === 'shortRest' ? 'mdi-music-rest-quarter' : 'mdi-bed'"
          :title="restTitle(type)"
          :subtitle="$t('party.restFor', { count: editableMembers.length }, editableMembers.length)"
          :data-id="`party-rest-${type}`"
          @click="rest(type)"
        />
      </v-list>
    </v-menu>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import { hasEditPermission } from '/imports/api/sharing/sharingPermissions';
import doAction from '/imports/ui/creature/actions/doAction';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

/**
 * What the game master does for the whole party at once, on the characters of
 * the board they can edit.
 */
const props = defineProps({
  creatures: {
    type: Array,
    required: true,
  },
});

const REST_TYPES = ['shortRest', 'longRest'];

const { t } = useI18n();
const dialogStackStore = useDialogStackStore();

const user = autorun(() => Meteor.user({ fields: { roles: 1 } })).result;

const members = computed(() => props.creatures.map(creature => ({
  _id: creature._id,
  name: creature.name,
  type: creature.type,
  editable: hasEditPermission(creature, user.value),
})));
const editableMembers = computed(() => members.value.filter(member => member.editable));

const resting = ref(undefined);

function restTitle(type) {
  return type === 'shortRest' ? t('common.shortRestTitle') : t('common.longRestTitle');
}

function giveExperience() {
  dialogStackStore.pushDialogStack({
    component: 'experience-insert-dialog',
    elementId: 'party-give-xp',
    data: { members: members.value },
  });
}

// A rest runs on the client first, to find the questions it asks: that needs
// all of the character's properties, of which the board only publishes a few
function subscribeToCharacter(creatureId) {
  return new Promise((resolve, reject) => {
    const handle = Meteor.subscribe('singleCharacter', creatureId, {
      onReady: () => resolve(handle),
      onStop: error => error && reject(error),
    });
  });
}

// One character after the other: a rest can ask a question, in the action
// dialog, before the next one starts
async function rest(type) {
  resting.value = type;
  const failed = [];
  const targets = editableMembers.value;
  for (const member of targets) {
    let subscription;
    try {
      subscription = await subscribeToCharacter(member._id);
      await doAction({
        creatureId: member._id,
        elementId: `party-member-${member._id}`,
        task: {
          subtaskFn: 'reset',
          targetIds: [member._id],
          eventName: type,
        },
      });
    } catch (error) {
      console.error(error);
      failed.push(member.name);
    } finally {
      subscription?.stop();
    }
  }
  resting.value = undefined;
  const done = targets.length - failed.length;
  snackbar({
    text: failed.length
      ? t('party.restFailed', { rest: restTitle(type), names: failed.join(', ') })
      : t('party.restDone', { rest: restTitle(type), count: done }, done),
  });
}
</script>
