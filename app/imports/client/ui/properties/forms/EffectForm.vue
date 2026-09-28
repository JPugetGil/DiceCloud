<template>
  <div class="effect-form">
    <v-row dense>
      <v-col
        cols="12"
        md="6"
      >
        <smart-select
          :label="$t('forms.operation')"
          append-icon="mdi-menu-down"
          :hint="operationHint"
          :error-messages="errors.operation"
          :menu-props="{transition: 'slide-y-transition', lazy: true}"
          :items="operations"
          :value="model.operation"
          @change="(...args) => change('operation', ...args)"
        >
          <template #prepend-inner>
            <v-icon

              class="icon ml-0"
              :class="iconClass"
            >
              {{ displayedIcon }}
            </v-icon>
          </template>
          <template
            #item="item"
          >
            <v-icon class="icon mr-2">
              {{ getEffectIcon(item.item.value, 1) }}
            </v-icon>
            {{ item.item.title }}
          </template>
        </smart-select>
      </v-col>
      <v-col
        cols="12"
        md="6"
      >
        <text-field
          v-if="model.operation === 'conditional'"
          :label="$t('forms.text')"
          :hint="$t('forms.effect.textHint')"
          :value="model.text"
          :error-messages="errors.text"
          @change="(...args) => change('text', ...args)"
        />
        <computed-field
          v-else
          :label="$t('forms.value')"
          :hint="$t('forms.effect.valueHint')"
          :disabled="!needsValue"
          :model="model.amount"
          :error-messages="errors.amount"
          @change="({path, value, ack}) =>
            $emit('change', {path: ['amount', ...path], value, ack})"
        />
      </v-col>
    </v-row>

    <smart-toggle
      :label="$t('forms.targetProperties')"
      :value="radioGroup"
      :options="[
        {name: $t('forms.targetByVariable'), value: 'stats'},
        {name: $t('forms.targetByTags'), value: 'tags'},
      ]"
      @change="changeTargetByTags"
    />

    <v-slide-y-transition hide-on-leave>
      <smart-combobox
        v-if="!model.targetByTags"
        :label="$t('forms.effect.stats')"
        class="mr-2"
        multiple
        small-chips
        deletable-chips
        :hint="$t('forms.effect.statsHint')"
        persistent-hint
        :value="model.stats"
        :items="attributeList"
        :error-messages="errors.stats"
        @change="(...args) => change('stats', ...args)"
      />
      <tag-targeting
        v-if="model.targetByTags"
        :model="model"
        :errors="errors"
        @change="e => $emit('change', e)"
        @push="e => $emit('push', e)"
        @pull="e => $emit('pull', e)"
      />
    </v-slide-y-transition>
    <v-expand-transition>
      <v-col
        v-if="model.targetByTags"
        cols="12"
      >
        <text-field
          :label="$t('forms.targetField')"
          :value="model.targetField"
          :hint="$t('forms.targetFieldHint')"
          :placeholder="$t('forms.defaultField')"
          persistent-placeholder
          :error-messages="errors.targetField"
          @change="(...args) => change('targetField', ...args)"
        />
      </v-col>
    </v-expand-transition>
    <form-sections
      v-if="$slots.default"
      type="effect"
    >
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import getEffectIcon from '/imports/client/ui/utility/getEffectIcon';
import TagTargeting from '/imports/client/ui/properties/forms/shared/TagTargeting.vue';
import { useAttributeList } from '/imports/client/ui/properties/forms/shared/lists/useAttributeList';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change', 'push', 'pull']);

function change(path, value, ack) {
  emit('change', { path: [path], value, ack });
}

const attributeList = useAttributeList();

const ICON_SPIN_DURATION = 300;

const displayedIcon = ref('add');
const iconClass = ref('');
const operations = [
  { value: 'base', title: t('forms.effectOps.base') },
  { value: 'add', title: t('forms.effectOps.add') },
  { value: 'mul', title: t('forms.effectOps.mul') },
  { value: 'min', title: t('forms.effectOps.min') },
  { value: 'max', title: t('forms.effectOps.max') },
  { value: 'set', title: t('forms.effectOps.set') },
  { value: 'advantage', title: t('forms.effectOps.advantage') },
  { value: 'disadvantage', title: t('forms.effectOps.disadvantage') },
  { value: 'passiveAdd', title: t('forms.effectOps.passiveAdd') },
  { value: 'fail', title: t('forms.effectOps.fail') },
  { value: 'conditional', title: t('forms.effectOps.conditional') },
];

const radioGroup = computed(() => {
  return props.model.targetByTags ? 'tags' : 'stats';
});

const needsValue = computed(() => {
  switch (props.model.operation) {
    case 'base': return true;
    case 'add': return true;
    case 'mul': return true;
    case 'min': return true;
    case 'max': return true;
    case 'set': return true;
    case 'advantage': return false;
    case 'disadvantage': return false;
    case 'passiveAdd': return true;
    case 'fail': return false;
    case 'conditional': return false;
    default: return true;
  }
});

const operationHint = computed(() => {
  switch (props.model.operation) {
    case 'base': return t('forms.effectHelp.base');
    case 'add': return t('forms.effectHelp.add');
    case 'mul': return t('forms.effectHelp.mul');
    case 'min': return t('forms.effectHelp.min');
    case 'max': return t('forms.effectHelp.max');
    case 'set': return t('forms.effectHelp.set');
    case 'advantage': return t('forms.effectHelp.advantage');
    case 'disadvantage': return t('forms.effectHelp.disadvantage');
    case 'passiveAdd': return t('forms.effectHelp.passiveAdd');
    case 'fail': return t('forms.effectHelp.fail');
    case 'conditional': return t('forms.effectHelp.conditional');
    default: return '';
  }
});

watch(() => props.model.operation, (newValue, oldValue) => {
  let newIcon = getEffectIcon(newValue, 1);
  if (!oldValue) {
    // Skip animation
    displayedIcon.value = newIcon;
  } else {
    iconClass.value = 'leaving';
    setTimeout(() => {
      displayedIcon.value = newIcon;
      iconClass.value = 'arriving';
      requestAnimationFrame(() => {
        iconClass.value = '';
      });
    }, ICON_SPIN_DURATION / 2);
  }
}, { immediate: true });

function changeTargetByTags(value, ack) {
  if (value === 'stats') {
    emit('change', { path: ['targetByTags'], value: undefined, ack });
  } else if (value === 'tags') {
    emit('change', { path: ['targetByTags'], value: true, ack });
  }
}
</script>

<style lang="css" scoped>
.v-theme--light .icon {
  color: black;
}

.icon {
  min-width: 30px;
  transition: transform 0.15s linear, opacity 0.15s ease;
  transform-origin: 18px center;
  margin-left: -12px;
}

.icon.leaving {
  transform: translateY(-24px);
  opacity: 0;
}

.icon.arriving {
  transform: translateY(24px);
  opacity: 0;
  transition: none;
}

.hidden {
  visibility: hidden;
}

.effect-form>div {
  flex-basis: 220px;
}
</style>
