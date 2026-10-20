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
import getServerDiceRoller from '/imports/api/engine/action/functions/userInput/getServerDiceRoller';

import AdvantageInput from '/imports/ui/creature/actions/input/AdvantageInput.vue';
import CheckInput from '/imports/ui/creature/actions/input/CheckInput.vue';
import ChoiceInput from '/imports/ui/creature/actions/input/ChoiceInput.vue';
import EngineActions from '/imports/api/engine/action/EngineActions';
import { runAction } from '/imports/api/engine/action/methods/runAction';
import ActionLogPreview from '/imports/ui/log/ActionLogPreview.vue';
import mutationToLogUpdates from '/imports/api/engine/action/functions/mutationToLogUpdates';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import { namingTargets } from '/imports/api/creature/log/logMessages';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import boardErrorText from '/imports/ui/creature/party/boardErrorText';
import { useI18n } from 'vue-i18n';

/** @typedef {import('/imports/api/engine/action/EngineActions').EngineAction} EngineAction */
/** @typedef {import('/imports/api/engine/action/functions/userInput/InputProvider').default} InputProvider */
/** @typedef {import('/imports/api/engine/action/functions/userInput/InputProvider').Advantage} Advantage */
/** @typedef {import('/imports/api/engine/action/functions/userInput/InputProvider').CheckParams} CheckParams */

const dialogStackStore = useDialogStackStore();
const { t } = useI18n();

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
const actionResult = shallowRef(/** @type {EngineAction | undefined} */ (undefined));
const resumeActionFn = ref(/** @type {(() => void) | undefined} */ (undefined));
const activeInput = ref(/** @type {'choice-input' | 'advantage-input' | 'check-input' | undefined} */ (undefined));
const activeInputParams = ref({});
// What the active input edits: the chosen ids, an advantage, or a check's parameters
const userInput = ref(/** @type {string[] | Advantage | CheckParams | undefined} */ (undefined));
// The action's dice, drawn by the server from a seed the client never sees,
// in the order the action asks for them: the same dice as doAction's first
// simulation, and as the server's when it applies the action
let serverDiceRoller = undefined;

const action = autorun(() => EngineActions.findOne(props.actionId)).result;

// As the actor's log will read it: an action on several creatures names each
// one in the lines about it alone (namingTargets), from the party's boards
const simulatedLog = computed(() => {
  const actionRes = actionResult.value;
  const content = [];
  actionRes?.results.forEach(result => {
    result.mutations.forEach(mutation => {
      content.push(...mutationToLogUpdates(mutation));
    });
  });
  return {
    content: namingTargets(content, actionRes?.task?.targetIds,
      id => Creatures.findOne(id, { fields: { name: 1 } })?.name),
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

/**
 * Resolves with the user's input, of the kind the active input asked for
 * @returns {Promise<any>}
 */
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

/** @type {InputProvider} */
const inputProvider = {
  async rollDice(dice) {
    // No dice animation here: the dice tray throws them once the server has
    // logged the action
    return serverDiceRoller(dice);
  },
  async nextStep() {
    return promiseInput();
  },
  async choose(choices, quantity) {
    userInput.value = [];
    activeInputParams.value = {
      choices,
      // The engine counts [min, max], -1 for no limit; ChoiceInput takes
      // { min, max }, and its default when there is none
      ...quantity && {
        quantity: { min: quantity[0], max: quantity[1] < 0 ? Infinity : quantity[1] },
      },
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
    actionResult.value = /** @type {EngineAction} */ ({
      ...action.value,
      _stepThrough: undefined,
      _isSimulation: undefined,
      taskCount: 0,
    });
    await applyAction(actionResult.value, inputProvider, { simulate: true, stepThrough });
    triggerRef(actionResult);
    const finalActionResult = await runAction.callAsync({
      // A document of the collection: it has its id
      actionId: /** @type {string} */ (actionResult.value._id),
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
  // doAction opens this dialog on the action it inserted
  serverDiceRoller = getServerDiceRoller(/** @type {string} */ (props.actionId));
  // The server may refuse the action as it applies it: a target no longer
  // in reach (a player who left the party since, assertMayTarget)
  startAction({ stepThrough: false }).catch(error => {
    console.error(error);
    snackbar({ text: boardErrorText(error, t) });
  });
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
