<template>
  <div
    ref="stackElement"
    class="dialog-stack"
  >
    <transition name="backdrop-fade">
      <div
        v-if="dialogs.length"
        class="backdrop"
        @click="backdropClicked"
      />
    </transition>
    <transition-group
      name="dialog-list"
      class="dialog-transition-group"
      :class="{shake}"
      tag="div"
      @enter="enter"
      @leave="leave"
    >
      <template
        v-for="(dialog, index) in dialogs"
        :key="dialog._id"
      >
        <component
          :is="resolveDialog(dialog.component)"
          v-if="isUnsizedDialog(dialog.component)"
          v-bind="dialog.data"
          class="unsized-dialog dialog-component"
          :data-element-id="dialog.elementId"
          :data-id="dialog._id"
          :data-index="index"
          :style="getDialogStyle(index)"
          :elevation="6"
          @pop="popDialogStack($event)"
        />
        <v-card
          v-else
          class="dialog"
          :data-element-id="dialog.elementId"
          :data-id="dialog._id"
          :data-index="index"
          :style="getDialogStyle(index)"
          :elevation="6"
        >
          <transition name="slide">
            <component
              :is="resolveDialog(dialog.component)"
              v-bind="dialog.data"
              class="sized-dialog dialog-component"
              @pop="popDialogStack($event)"
            />
          </transition>
        </v-card>
      </template>
    </transition-group>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import '/imports/client/ui/dialogStack/dialogStackWindowEvents';
import mockElement from '/imports/client/ui/dialogStack/mockElement';
import DialogComponentIndex from '/imports/client/ui/dialogStack/DialogComponentIndex';
import timeout from '/imports/api/utility/timeout';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const OFFSET = 16;
// Use in combination with browser's animation speed override to do slow-mod debugging
const animationSpeed = 1;

const unsizedDialogs = new Set(['image-preview-dialog', 'action-dialog']);

const dialogStackStore = useDialogStackStore();

const stackElement = ref(null);
const shake = ref(false);
// Source elements hidden while their dialog is open, restored as it closes
const hiddenElements = [];
// Page scroll position to restore once the last dialog closes
let pageScrollTop = 0;

const dialogs = computed(() => dialogStackStore.dialogs);

/**
 * Callers name dialogs in kebab-case ('creature-property-dialog'), and the index
 * is keyed by component name ('CreaturePropertyDialog'). <script setup> has no
 * `components:` registry to resolve those names through, so resolve them here
 * the way Vue's registry did.
 */
const toPascalCase = name => name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
function resolveDialog(name) {
  if (typeof name !== 'string') return name;
  return DialogComponentIndex[name] ?? DialogComponentIndex[toPascalCase(name)] ?? name;
}

// Lock the page's scroll behind open dialogs. This watches the length because the
// store mutates the array in place, and in Vue 3 a watcher on an array only fires
// when the array is replaced: watching `dialogs` itself never fired at all.
watch(() => dialogs.value.length, async (length, previousLength) => {
  const el = document.documentElement;
  if (length && !previousLength) {
    pageScrollTop = el.scrollTop;
    if (el.scrollHeight > el.clientHeight) {
      el.scrollTop = pageScrollTop;
      el.classList.add('lock-scroll');
    }
  } else if (!length) {
    await timeout(400 / animationSpeed);
    // a dialog may have opened while waiting
    if (dialogs.value.length) return;
    el.classList.remove('lock-scroll');
    el.scrollTop = pageScrollTop;
  }
});

function popDialogStack(result) {
  dialogStackStore.popDialogStack(result);
}

function isUnsizedDialog(component) {
  return unsizedDialogs.has(component);
}

function backdropClicked(event) {
  // If the target was not the backdrop, ignore
  if (event.target !== event.currentTarget) return;

  // If the top dialog can't be closed with the backdrop, shake shake
  const topDialog = dialogs.value[dialogs.value.length - 1];
  if (topDialog?.data?.noBackdropClose) {
    shakeTopDialog();
    return;
  }

  // Otherwise close the top dialog
  popDialogStack();
}

function shakeTopDialog() {
  shake.value = false;
  requestAnimationFrame(() => {
    shake.value = true;
  });
}

function getDialogStyle(index) {
  const length = dialogStackStore.dialogs.length;
  if (index >= length) return;
  const num = length - 1;
  const left = (num - index) * -OFFSET;
  const top = (num - index) * -OFFSET;
  return `left: calc(${left}px + 50%); top: calc(${top}px + 50%);${index < num ? ' filter: brightness(0.7);' : ''}`;
}

function getTopElementByDataId(elementId, offset = 0) {
  const stackLength = dialogStackStore.dialogs.length - offset;
  // Each dialog's root element carries its stack index, whether it is the
  // v-card wrapper or an unsized dialog's own root
  const topDialog = stackLength
    && stackElement.value?.querySelector(`.dialog-transition-group > [data-index='${stackLength - 1}']`);
  if (topDialog) {
    return topDialog.querySelector(`.v-window-item--active [data-id='${elementId}']`)
      ?? topDialog.querySelector(`[data-id='${elementId}']`)
      ?? document.querySelector(`.v-window-item--active [data-id='${elementId}']`)
      ?? document.querySelector(`[data-id='${elementId}']`);
  } else {
    return document.querySelector(`.v-window-item--active [data-id='${elementId}']`)
      ?? document.querySelector(`[data-id='${elementId}']`);
  }
}

async function enter(target, done) {
  if (!target || !target.attributes['data-element-id']) {
    done();
    return;
  }
  let elementId = target.attributes['data-element-id'].value;
  let source = getTopElementByDataId(elementId, 1);
  if (!source) {
    done();
    return;
  }
  // Get the original styles so we can repair them later
  let originalStyle = {
    transform: target.style.transform,
    backgroundColor: target.style.backgroundColor,
    borderRadius: target.style.borderRadius,
    transition: target.style.transition,
    boxShadow: target.style.boxShadow,
    sourceTransition: source.style.transition,
  }

  // Instantly mock the source
  target.style.transition = 'none';
  // If we are using unsized dialogs, first let it layout with no opacity, then mock and
  // carry on, otherwise it has no size
  if (target.classList.contains('unsized-dialog')) {
    target.style.opacity = '0';
    await new Promise(requestAnimationFrame);
    mockElement({ source, target });
    target.style.opacity = '1';
  } else {
    mockElement({ source, target });
  }

  // Wait one frame before hiding the source so we know our mock is in place
  await new Promise(requestAnimationFrame);

  // hide the source
  source.style.transition = 'none';
  source.style.opacity = '0';
  hiddenElements.push(source);

  // repair the styles so that our mock is undone revealing the dialog
  target.style.transform = originalStyle.transform;
  target.style.backgroundColor = originalStyle.backgroundColor;
  target.style.borderRadius = originalStyle.borderRadius;
  target.style.transition = originalStyle.transition;
  target.style.boxShadow = originalStyle.boxShadow;
  source.style.transition = originalStyle.sourceTransition;
  setTimeout(done, 300 / animationSpeed);
}

async function leave(target, done) {
  // Give minimongo time to update documents we might need to animate to
  await new Promise(requestAnimationFrame);
  let elementId;
  let hiddenElement = hiddenElements.pop();
  let returnElementId = await dialogStackStore.currentReturnElement;
  if (returnElementId) {
    elementId = returnElementId;
  } else {
    if (!target || !target.attributes['data-element-id']) {
      done();
      return;
    }
    elementId = target.attributes['data-element-id'].value;
  }
  const replacing = dialogStackStore.replacingDialog === target.attributes['data-id'].value;
  let source = getTopElementByDataId(elementId);
  if (!source || replacing) {
    if (hiddenElement) hiddenElement.style.opacity = '';
    // Just fade out gracefully
    target.style.transition = 'all 0.3s ease';
    target.style.opacity = '0';
    await timeout(300 / animationSpeed);
    done();
    return;
  }
  let index = target.attributes['data-index'].value;

  // Disable clicking the dialog while it's animating
  target.style.pointerEvents = 'none';

  // Make the dialog mock the source
  if (index != 0) {
    // If we aren't the only dialog, we'll need compensate for offset
    mockElement({ source, target, offset: { x: OFFSET, y: OFFSET } })
  } else {
    mockElement({ source, target });
  }

  // If the source and the hidden Element are different
  // hide the source and reveal the hidden element
  let originalSourceTransition = source.style.transition;
  if (hiddenElement !== source) {
    source.style.transition = 'none';
    source.style.opacity = '0';
    if (hiddenElement) hiddenElement.style.opacity = '';
    // wait a frame for these to apply without transitions
    await new Promise(requestAnimationFrame);
  }

  // Wait for the mock to finish
  await timeout(300 / animationSpeed);

  // reveal the source immediately
  source.style.opacity = '';
  source.style.transition = 'none';

  // Wait for the opacity swap to finish
  await timeout(100 / animationSpeed);

  // Fix the transition of the source
  source.style.transition = originalSourceTransition;

  // Done
  done();
}
</script>

<style scoped>
  .backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.4);
    z-index: 6;
    pointer-events: initial;
    opacity: 1;
  }
  .backdrop-fade-enter-active, .backdrop-fade-leave-active {
    transition: opacity 0.3s;
  }
  .backdrop-fade-enter-from, .backdrop-fade-leave-to {
    opacity: 0;
  }
  .dialog-stack {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    /* Above Vuetify 3's app bars and drawers, below its menus and overlays */
    z-index: 1500;
  }

  .shake {
    animation: shake 0.2s;
  }

  @keyframes shake {
    0% { transform: scale(1); }
    50% { transform: scale(1.02); }
    100% { transform: scale(1); }
  }

  .dialog-transition-group {
    position: relative;
    z-index: 7;
    height: 100%;
    width: 100%;
  }

  /*
    Fade in and out the dialog contents as it is animating
  */
  .dialog-list-enter-from .sized-dialog, .dialog-list-leave-to .sized-dialog {
    opacity: 0;
  }
  .dialog-list-enter-active .sized-dialog, .dialog-list-leave-active .sized-dialog {
    transition: opacity 0.3s;
  }

  /*
    Enter and leave with no shadow
  */
  .dialog-list-enter-from, .dialog-list-leave-to {
    box-shadow: none;
  }

  /*
    Leave to no opacity
  */
  .dialog-list-leave-to {
    opacity: 0;
  }

  .dialog.dialog-list-enter-active, .unsized-dialog.dialog-list-enter-active {
    transition: all 0.3s, box-shadow 0.1s, opacity 0s, pointer-events 0s;
  }
  .dialog.dialog-list-leave-active, .unsized-dialog.dialog-list-leave-active {
    transition: all 0.3s, box-shadow 0.1s 0.3s, opacity 0.1s 0.3s, pointer-events 0s;
  }

  /**
  Only the top dialog should be clickable
  */
  .dialog:last-child, .unsized-dialog:last-child {
    pointer-events: initial;
  }

  .dialog {
    height: 100%;
    width: 100%;
    max-height: 800px;
    max-width: 1000px;
  }
  .dialog, .unsized-dialog {
    transform-origin: center;
    position: absolute;
    z-index: 1;
    overflow: hidden;
    transition: all 0.3s ease;
    transform: translate(-50%, -50%) scale(1);
  }
  @media only screen and  (min-width:  601px){
    .dialog-stack {
      padding: 32px;
    }
  }
  .dialog > .sized-dialog {
    height: 100%;
    width: 100%;
  }
</style>
