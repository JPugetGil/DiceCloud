<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('xp.addExperience') }}
      </v-toolbar-title>
    </template>
    <template v-if="members">
      <v-list-subheader class="ps-0">
        {{ $t('xp.members') }}
      </v-list-subheader>
      <v-checkbox
        v-for="member in members"
        :key="member._id"
        v-model="selectedIds"
        :value="member._id"
        :label="member.name"
        :disabled="!member.editable"
        :hint="member.editable ? undefined : $t('xp.cantEdit')"
        :persistent-hint="!member.editable"
        :hide-details="member.editable"
        density="compact"
        :data-id="`xp-member-${member._id}`"
      />
      <p
        v-if="selectionError"
        class="text-error text-body-medium mt-2 mb-0"
      >
        {{ selectionError }}
      </p>
      <v-divider class="my-4" />
    </template>
    <experience-form
      :model="model"
      :errors="errors"
      @change="change"
    />
    <template v-if="members && !isMilestone && selectedIds.length > 1">
      <v-switch
        v-model="share"
        :label="$t('xp.share')"
        color="primary"
        hide-details
        data-id="xp-share"
      />
      <p class="text-body-medium text-medium-emphasis mb-0">
        {{ $t('xp.each', { xp: xpEach }) }}
      </p>
    </template>
    <template #actions>
      <div
        class="d-flex flex-1-1 justify-end"
      >
        <v-btn
          variant="text"
          :disabled="!valid || !!selectionError"
          :loading="saving"
          data-id="xp-insert"
          @click="insertExperience"
        >
          {{ $t('common.insert') }}
        </v-btn>
      </div>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed, provide, reactive } from 'vue';
import { toPath } from 'lodash';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import ExperienceForm from '/imports/ui/creature/experiences/ExperienceForm.vue';
import { useI18n } from 'vue-i18n';
import {
  ExperienceSchema, insertExperience as insertExperienceMethod, MAX_EXPERIENCE_CREATURES,
} from '/imports/api/creature/experience/Experiences';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

const dialogStackStore = useDialogStackStore();
const { t } = useI18n();

const props = defineProps({
  // The characters that get the experience, unless `members` is given
  creatureIds: {
    type: Array,
    default: () => [],
  },
  // A party's characters to choose from: { _id, name, type, editable }. Those
  // that can be edited and are player characters start chosen.
  members: {
    type: Array,
    default: undefined,
  },
});

const selectedIds = ref((props.members || [])
  .filter(member => member.editable && member.type === 'pc')
  .map(member => member._id));
const recipientIds = computed(() => props.members ? selectedIds.value : props.creatureIds);

const selectionError = computed(() => {
  if (!props.members) return undefined;
  if (!selectedIds.value.length) return t('xp.chooseMembers');
  if (selectedIds.value.length > MAX_EXPERIENCE_CREATURES) {
    return t('xp.tooManyMembers', { max: MAX_EXPERIENCE_CREATURES });
  }
  return undefined;
});

// Shares the XP typed among the characters chosen, rounded down, rather than
// giving it to each
const share = ref(false);
const saving = ref(false);


// Provide Context
const debounceTime = ref(0);

provide('context', reactive({
  debounceTime,
}));

// State
const schema = ExperienceSchema.omit('creatureId');
const validationContext = schema.newContext();

const model = ref(schema.clean({}));

// Computed Properties
const errors = computed(() => {
  if (!model.value) {
    throw new Error('model must be set');
  }
  if (!validationContext) return {};
  let cleanModel = validationContext.clean(model.value, {
    getAutoValues: false,
  });
  validationContext.validate(cleanModel);
  let errorsObj = {};
  validationContext.validationErrors().forEach(error => {
    errorsObj[error.name] = schema.messageForError(error);
  });
  return errorsObj;
});

// Derived rather than set from inside errors(): a computed that writes to a ref
// runs its side effect on every re-evaluation, including ones Vue discards
const valid = computed(() => !Object.keys(errors.value).length);

const isMilestone = computed(() => model.value.levels !== undefined);

const xpEach = computed(() => {
  const xp = Number(model.value.xp) || 0;
  if (!share.value) return xp;
  return Math.floor(xp / Math.max(recipientIds.value.length, 1));
});

// The object that holds the value at `path`, and the value's key in it
function resolvePath(modelObj, path) {
  let arrayPath = toPath(path);
  if (arrayPath.length === 1) {
    return { object: modelObj, key: arrayPath[0] };
  }
  let key = arrayPath.slice(-1);
  let objectPath = arrayPath.slice(0, -1);
  let object = modelObj;
  // Ensure that nested objects exist before navigating them
  objectPath.forEach(pathKey => {
    let newObject = object[pathKey];
    if (!newObject) {
      newObject = {};
      object[pathKey] = newObject;
    }
    object = newObject;
  });
  return { object, key };
}

function change({ path, value, ack }) {
  let { object, key } = resolvePath(model.value, path);
  object[key] = value;
  if (ack) ack();
}

// Methods
async function insertExperience() {
  const experience = schema.clean(model.value);
  if (experience.xp && share.value) experience.xp = xpEach.value;
  saving.value = true;
  try {
    const ids = await insertExperienceMethod.callAsync({
      experience,
      creatureIds: recipientIds.value,
    });
    if (props.members) {
      snackbar({ text: t('xp.given', { count: ids.length }, ids.length) });
    }
    await dialogStackStore.popDialogStack(ids);
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || String(error) });
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="css" scoped>

</style>
