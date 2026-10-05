<template>
  <div class="d-flex flex-1-1 align-center justify-center increment-menu">
    <v-spacer />
    <v-btn-toggle
      :model-value="operation === 'add' ? 0: operation === 'subtract' ? 1 : null"
      class="mx-2"
      @click="focusInput"
    >
      <v-btn
        :disabled="context.editPermission === false"
        class="bg-surface-light"
        :aria-label="$t('increment.add')"
        data-id="increment-add"
        @click="toggleAdd(); focusInput()"
      >
        <v-icon>mdi-plus</v-icon>
      </v-btn>
      <v-btn
        :disabled="context.editPermission === false"
        class="bg-surface-light"
        :aria-label="$t('increment.subtract')"
        data-id="increment-subtract"
        @click="toggleSubtract(); focusInput()"
      >
        <v-icon>mdi-minus</v-icon>
      </v-btn>
    </v-btn-toggle>
    <v-text-field
      ref="editInput"
      :variant="!flat ? 'solo' : undefined"
      :class="flat && 'ma-0 pa-0'"
      hide-details
      type="number"
      style="max-width: 120px;"
      min="0"
      :model-value="editValue"
      :aria-label="$t('increment.value')"
      data-id="increment-value"
      :prepend-inner-icon="operationIcon(operation)"
      :disabled="context.editPermission === false"
      @focus="$event.target.select()"
      @keypress="keypress"
      @update:model-value="input"
    />
    <v-btn
      :size="!flat ? 'small' : undefined"
      icon
      :variant="flat ? 'text' : undefined"
      class="mx-2 bg-surface-light"
      :aria-label="$t('increment.apply')"
      data-id="increment-apply"
      @click="commitEdit"
    >
      <v-icon>mdi-check</v-icon>
    </v-btn>
    <v-btn
      :size="!flat ? 'small' : undefined"
      icon
      :variant="flat ? 'text' : undefined"
      class="bg-surface-light"
      :aria-label="$t('common.cancel')"
      @click="cancelEdit"
    >
      <v-icon>mdi-close</v-icon>
    </v-btn>
    <v-spacer />
  </div>
</template>

<script setup>
import { ref, watch, inject, nextTick } from 'vue';

const context = inject('context', {});

const props = defineProps({
  value: {
    type: Number,
    default: 0,
  },
  open: Boolean,
  flat: Boolean,
});

const emit = defineEmits(['close', 'change']);

const editInput = ref(null);
const editValue = ref(props.value);
const operation = ref('set');

watch(() => props.open, (isOpen) => {
  if (isOpen) resetData();
}, { immediate: true });

function resetData() {
  editValue.value = props.value;
  operation.value = 'set';
  // nextTick didn't work, using timeout instead did
  setTimeout(() => {
    if (editInput.value) {
      editInput.value.focus();
    }
  }, 100);
}

function cancelEdit() {
  emit('close');
}

function commitEdit() {
  // Use editValue which is synced via the input event
  let value = +editValue.value;
  if (operation.value === 'add') {
    value = -value;
  }
  let type = operation.value === 'set' ? 'set' : 'increment';
  emit('change', { type, value });
}

function operationIcon(operation) {
  switch (operation) {
    case 'set':
      return 'mdi-forward';
    case 'add':
      return 'mdi-plus';
    case 'subtract':
      return 'mdi-minus';
  }
}

function toggleAdd() {
  operation.value = (operation.value === 'add') ? 'set' : 'add';
}

function toggleSubtract() {
  operation.value = (operation.value === 'subtract') ? 'set' : 'subtract';
}

async function focusInput() {
  await nextTick();
  editInput.value?.focus();
}

function keypress(event) {
  let digitsOnly = /[0-9]/;
  let key = event.key;
  if (key === '+') {
    toggleAdd();
    event.preventDefault();
  } else if (key === '-') {
    toggleSubtract();
    event.preventDefault();
  } else if (key === 'Enter') {
    commitEdit();
  } else if (!digitsOnly.test(key)) {
    event.preventDefault();
  }
}

function input(value) {
  if (+value < 0) {
    editValue.value = -value;
    operation.value = 'subtract';
  } else {
    editValue.value = value;
  }
}
</script>
