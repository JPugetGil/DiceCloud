<template>
  <div class="overflow-visible">
    <v-slide-x-reverse-transition hide-on-leave>
      <v-card
        :key="`${activeInput}`"
        elevation="6"
        class="action-dialog"
      >
        <component
          :is="activeInputComponent"
          v-if="activeInput"
          v-model="userInput"
          class="action-input"
          v-bind="activeInputParams"
          @continue="continueAction"
          @set-input-ready="setInputReady"
        />
        <div
          v-else
          class="log-preview card-raised-background"
        >
          <action-log-preview :model="simulatedLog" />
        </div>
        <v-btn
          v-if="!activeInput"
          size="large"
          variant="text"
          color="accent"
          style="width: 100%"
          class="done-button"
          @click="finishAction"
        >
          Done
        </v-btn>
      </v-card>
    </v-slide-x-reverse-transition>
  </div>
</template>

<script setup>
import { ref, shallowRef, triggerRef, computed, onMounted } from 'vue';
import { autorun } from 'vue-meteor-tracker';

import applyAction from '/imports/api/engine/action/functions/applyAction';
import getDeterministicDiceRoller from '/imports/api/engine/action/functions/userInput/getDeterministicDiceRoller';

import AdvantageInput from '/imports/client/ui/creature/actions/input/AdvantageInput.vue';
import CheckInput from '/imports/client/ui/creature/actions/input/CheckInput.vue';
import ChoiceInput from '/imports/client/ui/creature/actions/input/ChoiceInput.vue';
import EngineActions from '/imports/api/engine/action/EngineActions';
//import RollInput from '/imports/client/ui/creature/actions/input/RollInput.vue';
import CastSpellInput from '/imports/client/ui/creature/actions/input/CastSpellInput.vue';
import { runAction } from '/imports/api/engine/action/methods/runAction';
import ActionLogPreview from '/imports/client/ui/log/ActionLogPreview.vue';
import mutationToLogUpdates from '/imports/api/engine/action/functions/mutationToLogUpdates';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  actionId: {
    type: String,
    default: undefined,
  },
  task: {
    type: Object,
    default: undefined,
  },
  actionFinishedCallback: {
    type: Function,
    default: undefined,
  }
});


const actionBusy = ref(false);
const actionDone = ref(false);
// The engine updates the action it is given through its own references, which
// Vue 3's proxies do not see (Vue 2 made the object itself reactive): the log
// preview kept only its first line. A shallow ref, refreshed whenever the engine
// pauses or finishes, shows the latest state.
const actionResult = shallowRef(undefined);
const resumeActionFn = ref(undefined);
const activeInput = ref(undefined);
const activeInputParams = ref({});
const userInput = ref(undefined);
const userInputReady = ref(true);
let deterministicDiceRoller = undefined;

const action = autorun(() => EngineActions.findOne(props.actionId)).result;



const simulatedLog = computed(() => {
  const actionRes = actionResult.value;
  const content = [];
  actionRes?.results.forEach(result => {
    result.mutations.forEach(mutation => {
      content.push(...mutationToLogUpdates(mutation));
    });
  });
  return {
    content,
    creatureId: actionRes?.creatureId,
  };
});

const activeInputComponent = computed(() => {
  switch (activeInput.value) {
    case 'choice-input': return ChoiceInput;
    case 'advantage-input': return AdvantageInput;
    case 'check-input': return CheckInput;
    case 'cast-spell-input': return CastSpellInput;
    // case 'roll-input': return RollInput;
    default: return undefined;
  }
});

const setInputReady = (val) => {
  userInputReady.value = val;
};


const promiseInput = () => {
  triggerRef(actionResult);
  return new Promise(resolve => {
    resumeActionFn.value = () => {
      resumeActionFn.value = undefined;
      const savedInput = userInput.value;
      userInput.value = undefined;
      activeInput.value = undefined;
      activeInputParams.value = {};
      userInputReady.value = false;
      resolve(savedInput);
    };
  });
};

const inputProvider = {
  async rollDice(dice) {
    return Promise.resolve(deterministicDiceRoller(dice));
    /* Dice Animation and user control goes here:
    activeInputParams.value = {
      deterministicDiceRoller,
      dice
    };
    activeInput.value = 'roll-input';
    return promiseInput();
    */
  },
  async nextStep() {
    return promiseInput();
  },
  async choose(choices, quantity) {
    userInput.value = [];
    activeInputParams.value = {
      choices,
      quantity
    };
    activeInput.value = 'choice-input';
    return promiseInput();
  },
  async advantage(suggestedAdvantage) {
    userInput.value = suggestedAdvantage;
    activeInput.value = 'advantage-input';
    userInputReady.value = true;
    return promiseInput();
  },
  async check(suggestedParams) {
    userInput.value = suggestedParams;
    activeInput.value = 'check-input';
    return promiseInput();
  },
  async castSpell(suggestedParams) {
    userInput.value = suggestedParams;
    activeInputParams.value = {
      creatureId: action.value?.creatureId,
    };
    activeInput.value = 'cast-spell-input';
    return promiseInput();
  }
};

const startAction = async ({ stepThrough }) => {
  actionBusy.value = true;
  actionResult.value = {
    ...action.value,
    _stepThrough: undefined,
    _isSimulation: undefined,
    taskCount: undefined,
  };
  await applyAction(actionResult.value, inputProvider, { simulate: true, stepThrough });
  triggerRef(actionResult);
  const finalActionResult = await runAction.callAsync({
    actionId: actionResult.value._id,
    decisions: actionResult.value._decisions
  });
  actionDone.value = true;
  actionBusy.value = false;
  activeInput.value = undefined;
  if (props.actionFinishedCallback) props.actionFinishedCallback(finalActionResult);
};


const continueAction = () => {
  if (actionResult.value) {
    actionResult.value._stepThrough = false;
  }
  resumeActionFn.value?.();
};

const finishAction = async () => {
  dialogStackStore.popDialogStack(actionResult.value);
};

onMounted(() => {
  deterministicDiceRoller = getDeterministicDiceRoller(props.actionId);
  startAction({ stepThrough: false });
});

</script>

<style lang="css" scoped>
.action-dialog {
  max-height: min(100vh, 800px);
  max-width: min(100vh, 1000px);
  min-width: 300px;
}

.action-input {
  overflow-y: auto;
}

.log-preview {
  overflow-y: auto;
  flex-basis: 300px;
}

</style>
