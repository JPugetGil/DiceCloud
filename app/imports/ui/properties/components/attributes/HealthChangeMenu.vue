<template>
  <v-card
    class="health-change-menu"
    data-id="health-change-menu"
    min-width="300"
    max-width="360"
  >
    <v-card-text class="pb-0">
      <smart-toggle
        :label="$t('health.change', { name })"
        :model-value="mode"
        :options="[
          { name: $t('health.damage'), value: 'damage', icon: 'mdi-heart-minus' },
          { name: $t('health.healing'), value: 'healing', icon: 'mdi-heart-plus' },
          { name: $t('health.set'), value: 'set', icon: 'mdi-equal' },
        ]"
        class="mb-n2"
        data-id="health-change-mode"
        @change="(value, ack) => { setMode(value); ack(); }"
      />
      <div class="d-flex flex-wrap ga-3">
        <v-text-field
          ref="amountInput"
          v-model="amount"
          type="number"
          min="0"
          :label="mode === 'set' ? $t('health.newValue') : $t('health.amount')"
          :hint="hint"
          persistent-hint
          class="flex-1-1"
          style="min-width: 120px;"
          data-id="health-change-amount"
          @keydown.enter.prevent="apply"
          @keypress="keypress"
        />
        <v-select
          v-if="mode === 'damage' && !noDamageType"
          v-model="damageType"
          :items="damageTypes"
          :label="$t('health.damageType')"
          clearable
          class="flex-1-1"
          style="min-width: 140px;"
          data-id="health-change-type"
        />
      </div>
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn
        variant="text"
        @click="$emit('close')"
      >
        {{ $t('common.cancel') }}
      </v-btn>
      <v-btn
        variant="flat"
        color="primary"
        :disabled="!valid"
        data-id="health-change-apply"
        @click="apply"
      >
        {{ $t('health.apply') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import DAMAGE_TYPES from '/imports/constants/DAMAGE_TYPES';
import { damageTypeName } from '/imports/ui/i18n';

/**
 * Changing a health bar (UX1): damage or healing, dealt by the engine as a
 * damage property deals it (temporary hit points first, the creature's
 * triggers), or setting the bar to a value. Damage is the default: a number
 * typed alone used to set the bar to it.
 */
const props = defineProps({
  // Without a damage type: a creature of the initiative tracker
  noDamageType: Boolean,
  // The bar's name and current value
  name: {
    type: String,
    default: '',
  },
  value: {
    type: Number,
    default: 0,
  },
  open: Boolean,
});

const emit = defineEmits(['change', 'close']);
const { t } = useI18n();

const mode = ref('damage');
const amount = ref('');
const damageType = ref(null);
const amountInput = ref(null);

// The standard damage types, translated; healing and "extra" are not ones
const damageTypes = computed(() => DAMAGE_TYPES
  .filter(type => type !== 'healing' && type !== 'extra')
  .map(type => ({ title: damageTypeName(type), value: type })));

const number = computed(() => Number(amount.value));
const valid = computed(() => amount.value !== '' && Number.isFinite(number.value)
  && (mode.value === 'set' || number.value > 0));

const hint = computed(() => {
  // A creature of the initiative tracker has no temporary hit points nor effects
  if (props.noDamageType && mode.value !== 'set') return undefined;
  if (mode.value === 'damage') return t('health.damageHint');
  if (mode.value === 'healing') return t('health.healingHint');
  return t('health.setHint', { value: props.value });
});

async function focusAmount() {
  await nextTick();
  setTimeout(() => amountInput.value?.focus(), 50);
}

watch(() => props.open, open => {
  if (!open) return;
  mode.value = 'damage';
  amount.value = '';
  damageType.value = null;
  focusAmount();
}, { immediate: true });

function setMode(value) {
  mode.value = value;
  // Setting starts from the current value; damage and healing from nothing
  amount.value = value === 'set' ? String(props.value) : '';
  focusAmount();
}

// + and − switch to healing and damage, as the old menu's keys did
function keypress(event) {
  if (event.key === '+') {
    setMode('healing');
    event.preventDefault();
  } else if (event.key === '-') {
    setMode('damage');
    event.preventDefault();
  }
}

function apply() {
  if (!valid.value) return;
  emit('change', {
    mode: mode.value,
    value: Math.floor(number.value),
    damageType: mode.value === 'healing' ? 'healing' : damageType.value || undefined,
  });
}
</script>
