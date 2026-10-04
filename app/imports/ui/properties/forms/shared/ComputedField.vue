<template>
  <div
    class="computed-field"
    :class="$attrs.class"
    :style="$attrs.style"
  >
    <div
      ref="inputWrapper"
      class="computed-field__input"
    >
      <text-field
        :model-value="model.calculation"
        v-bind="{ ...$attrs, class: undefined, style: undefined }"
        @change="(value, ack) => $emit('change', {path: ['calculation'], value, ack})"
      >
        <template
          v-if="showValue"
          #value
        >
          {{ displayedValue }}
        </template>
        <template
          v-if="$slots.prepend"
          #prepend
        >
          <slot name="prepend" />
        </template>
      </text-field>
      <v-sheet
        v-if="shown.length"
        :id="listId"
        class="computed-field__suggestions"
        :style="listPosition"
        elevation="3"
        rounded
        role="listbox"
        :aria-label="$t('formula.suggestions')"
        data-id="formula-suggestions"
      >
        <v-list
          density="compact"
          class="py-1"
        >
          <v-list-item
            v-for="(suggestion, index) in shown"
            :id="`${listId}-${index}`"
            :key="`${suggestion.kind}-${suggestion.label}`"
            :active="index === activeIndex"
            color="primary"
            role="option"
            :aria-selected="index === activeIndex"
            :data-id="`formula-suggestion-${suggestion.label}`"
            @mousedown.prevent="pick(suggestion)"
          >
            <template #prepend>
              <v-icon size="small">
                {{ suggestion.kind === 'function' ? 'mdi-function-variant' : 'mdi-variable' }}
              </v-icon>
            </template>
            <v-list-item-title>
              {{ suggestion.label }}<span
                v-if="suggestion.kind === 'function'"
                class="text-medium-emphasis"
              >()</span>
            </v-list-item-title>
            <v-list-item-subtitle v-if="detail(suggestion)">
              {{ detail(suggestion) }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </v-sheet>
    </div>
    <calculation-error-list :errors="errorList" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, useId } from 'vue';
import CalculationErrorList from '/imports/ui/properties/forms/shared/CalculationErrorList.vue';
import useFormulaSuggestions, { describeCreatureVariable } from '/imports/ui/properties/forms/shared/useFormulaSuggestions';
import { applySuggestion, getWordAtCaret, rankSuggestions } from '/imports/ui/properties/forms/shared/formulaSuggestions';

// The field's attributes (label, prefix, hint...) belong to the text field;
// only class and style lay out the wrapper. Inherited, they all landed on the
// div too, and a prefix there throws: Element.prefix is read-only
defineOptions({
  inheritAttrs: false,
});

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  hideValue: {
    type: Boolean,
  },
});

defineEmits(['change']);

const displayedValue = computed(() => {
  // Use the unaffected value instead if the calculation has it, because effects can modify the value
  if (props.model?.unaffected !== undefined) {
    return props.model.unaffected;
  }
  return props.model?.value;
});

const showValue = computed(() => {
  let value = displayedValue.value;
  if (
    props.hideValue || 
    (value === undefined || value === null) ||
    value == props.model?.calculation
  ) return false;
  return true;
});

const errorList = computed(() => {
  if (props.model?.parseError) {
    return [props.model.parseError, ...(props.model.errors || [])];
  } else {
    return props.model?.errors;
  }
});

// Suggestions of the variable or function name typed at the caret: arrows to
// move, Enter or Tab to insert it, Escape to close
const suggestions = useFormulaSuggestions();
const listId = `formula-suggestions-${useId()}`;
const inputWrapper = ref(null);
const shown = ref([]);
const activeIndex = ref(0);
const listPosition = ref({});
let input = null;
let wordRange = undefined;

function detail(suggestion) {
  return suggestion.creatureId ? describeCreatureVariable(suggestion) : suggestion.detail;
}

function setAria() {
  if (!input) return;
  input.setAttribute('aria-expanded', String(!!shown.value.length));
  if (shown.value.length) {
    input.setAttribute('aria-activedescendant', `${listId}-${activeIndex.value}`);
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

function close() {
  shown.value = [];
  wordRange = undefined;
  setAria();
}

function update() {
  if (!input || document.activeElement !== input) return close();
  wordRange = getWordAtCaret(input.value, input.selectionStart ?? input.value.length);
  shown.value = wordRange ? rankSuggestions(suggestions.value || [], wordRange.word) : [];
  activeIndex.value = 0;
  // Right under the field, whatever hint or message shows below it
  const field = input.closest('.v-field');
  if (field) {
    listPosition.value = { top: `${field.offsetTop + field.offsetHeight}px`, left: `${field.offsetLeft}px`, width: `${field.offsetWidth}px` };
  }
  setAria();
}

function pick(suggestion) {
  if (!input || !wordRange) return;
  const { text, caret } = applySuggestion(input.value, wordRange, suggestion);
  input.value = text;
  input.setSelectionRange(caret, caret);
  // As if typed: the field saves it the usual way
  input.dispatchEvent(new Event('input', { bubbles: true }));
  close();
}

function onKeydown(event) {
  if (!shown.value.length) return;
  const count = shown.value.length;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
    setAria();
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault();
    pick(shown.value[activeIndex.value]);
  } else if (event.key === 'Escape') {
    // Closes the list, not the dialog around the field
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}

function onKeyup(event) {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) update();
}

const listeners = { input: update, click: update, keyup: onKeyup, blur: close };

onMounted(() => {
  input = inputWrapper.value?.querySelector('input');
  if (!input) return;
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', listId);
  setAria();
  input.addEventListener('keydown', onKeydown, true);
  for (const [name, listener] of Object.entries(listeners)) input.addEventListener(name, listener);
});

onBeforeUnmount(() => {
  if (!input) return;
  input.removeEventListener('keydown', onKeydown, true);
  for (const [name, listener] of Object.entries(listeners)) input.removeEventListener(name, listener);
});
</script>

<style lang="css" scoped>
.computed-field__input {
  position: relative;
}

.computed-field__suggestions {
  position: absolute;
  z-index: 10;
  min-width: 240px;
  max-height: 320px;
  overflow-y: auto;
}
</style>
