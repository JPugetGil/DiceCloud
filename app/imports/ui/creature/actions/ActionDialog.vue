<template>
  <div class="overflow-visible">
    <v-slide-x-reverse-transition hide-on-leave>
      <v-card
        :key="`${activeInput}`"
        elevation="2"
        class="action-dialog"
      >
        <component
          :is="activeInputComponent"
          v-if="activeInput"
          v-model="userInput"
          class="action-input overflow-y-auto"
          v-bind="activeInputParams"
          @continue="continueAction"
          @cancel="dialogStackStore.popDialogStack()"
        />
        <div
          v-else
          class="log-preview bg-raised"
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
          :loading="actionBusy"
          @click="finishAction"
        >
          {{ $t('common.done') }}
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

import AdvantageInput from '/imports/ui/creature/actions/input/AdvantageInput.vue';
import CheckInput from '/imports/ui/creature/actions/input/CheckInput.vue';
import ChoiceInput from '/imports/ui/creature/actions/input/ChoiceInput.vue';
import EngineActions from '/imports/api/engine/action/EngineActions';
import { runAction } from '/imports/api/engine/action/methods/runAction';
import ActionLogPreview from '/imports/ui/log/ActionLogPreview.vue';
import mutationToLogUpdates from '/imports/api/engine/action/functions/mutationToLogUpdates';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  actionId: {
    type: String,
    default: undefined,
  },
  actionFinishedCallback: {
    type: Function,
    default: undefined,
  }
});

// True from the start of the simulation until the server has applied the
// action: Done waits for it, so the sheet is up to date when the dialog closes
const actionBusy = ref(false);
// The engine updates the action it is given through its own references, which
// Vue's reactive proxies do not see, so a deep ref would keep only the log
// preview's first line. A shallow ref, refreshed whenever the engine pauses or
// finishes, shows the latest state.
const actionResult = shallowRef(undefined);
const resumeActionFn = ref(undefined);
const activeInput = ref(undefined);
const activeInputParams = ref({});
const userInput = ref(undefined);
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
    default: return undefined;
  }
});

const promiseInput = () => {
  triggerRef(actionResult);
  return new Promise(resolve => {
    resumeActionFn.value = () => {
      resumeActionFn.value = undefined;
      const savedInput = userInput.value;
      userInput.value = undefined;
      activeInput.value = undefined;
      activeInputParams.value = {};
      resolve(savedInput);
    };
  });
};

const inputProvider = {
  async rollDice(dice) {
    // Dice are rolled straight away: there is no dice animation to show
    return Promise.resolve(deterministicDiceRoller(dice));
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
    return promiseInput();
  },
  async check(suggestedParams) {
    userInput.value = suggestedParams;
    activeInput.value = 'check-input';
    return promiseInput();
  },
};

const startAction = async ({ stepThrough }) => {
  actionBusy.value = true;
  try {
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
    activeInput.value = undefined;
    if (props.actionFinishedCallback) props.actionFinishedCallback(finalActionResult);
  } finally {
    // A failed action must not leave Done spinning and unclickable
    actionBusy.value = false;
  }
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

.log-preview {
  overflow-y: auto;
  flex-basis: 300px;
}

</style>
