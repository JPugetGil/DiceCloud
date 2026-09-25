<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('xp.addExperience') }}
      </v-toolbar-title>
    </template>
    <experience-form
      :start-as-milestone="startAsMilestone"
      :model="model"
      :errors="errors"
      @change="change"
      @push="push"
      @pull="pull"
    />
    <template #actions>
      <div

        class="d-flex flex-1-1 justify-end"
      >
        <v-btn
          variant="text"
          :disabled="!valid"
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
import { get, toPath } from 'lodash';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import ExperienceForm from '/imports/client/ui/creature/experiences/ExperienceForm.vue';
import { ExperienceSchema, insertExperience as insertExperienceMethod } from '/imports/api/creature/experience/Experiences';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  creatureIds: {
    type: Array,
    required: true,
  },
  startAsMilestone: {
    type: Boolean,
  },
});


// Provide Context
const debounceTime = ref(0);

provide('context', reactive({
  debounceTime,
}));

// State
const schema = ExperienceSchema.omit('creatureId');
const validationContext = schema.newContext();

let startingModel = {};
if (props.startAsMilestone) {
  startingModel.levels = 1;
}

const model = ref(schema.clean(startingModel));

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

// Inlined from schemaFormMixin.js
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

function push({ path, value, ack }) {
  let array = get(model.value, path);
  if (array === undefined) {
    let { object, key } = resolvePath(model.value, path);
    object[key] = [value];
  } else if (!array.push) {
    throw `${path.join('.')} is ${array}, doesn't have "push"`;
  } else {
    array.push(value);
  }
  if (ack) ack();
}

function pull({ path, ack }) {
  let { object, key } = resolvePath(model.value, path);
  if (!object || !object.splice) {
    throw `${path.join('.')} is ${object}, doesnt have "splice"`;
  }
  object.splice(key, 1);
  if (ack) ack();
}

// Methods
async function insertExperience() {
  let experience = schema.clean(model.value);
  try {
    const id = await insertExperienceMethod.callAsync({
      experience,
      creatureIds: props.creatureIds,
    });
    await dialogStackStore.popDialogStack(id);
  } catch (error) {
    console.error(error);
  }
}
</script>

<style lang="css" scoped>

</style>
