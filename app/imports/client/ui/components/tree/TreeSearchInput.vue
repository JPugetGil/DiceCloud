<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        variant="text"

        icon
        v-bind="activatorProps"
      >
        <v-badge
          :content="numFilters"
          :model-value="!!numFilters"
          color="primary"
        >
          <v-icon>mdi-magnify</v-icon>
        </v-badge>
      </v-btn>
    </template>

    <v-card>
      <v-card-title>
        {{ $t('common.search') }}
      </v-card-title>
      <v-card-text>
        <v-select
          v-model="typeFilterInput"
          variant="outlined"
          :label="$t('common.type')"
          :items="filterOptions"
          multiple
          clearable
          chips
          closable-chips
        />
        <v-slide-x-transition group>
          <div
            v-for="(fieldFilter, index) in fieldFilters"
            :key="index"
            class="d-flex"
          >
            <v-text-field
              v-model="fieldFilter.field"
              class="text--mono"
              :label="$t('treeSearch.field')"
              variant="outlined"
            />
            <v-text-field
              v-model="fieldFilter.value"
              :label="$t('treeSearch.text')"
              class="ml-2"
              variant="outlined"
            />
            <v-btn
              v-if="fieldFilters.length > 1"
              icon
              @click="fieldFilters.splice(index, 1)"
            >
              <v-icon>mdi-close</v-icon>
            </v-btn>
          </div>
        </v-slide-x-transition>
        <div
          v-if="fieldFilters.length < 5"
          class="d-flex"
        >
          <v-spacer />
          <v-btn
            variant="text"
            icon
            @click="fieldFilters.push({name: '', value: undefined})"
          >
            <v-icon>mdi-plus</v-icon>
          </v-btn>
        </div>
        <v-card-actions>
          <v-btn
            variant="text"
            @click="
              fieldFilters = [{field: 'name', value: undefined}];
              typeFilterInput = [];
              menu = false;
            "
          >
            <v-icon start>
              mdi-close
            </v-icon>
            {{ $t('common.clear') }}
          </v-btn>
          <v-spacer />
          <v-btn
            variant="text"
            color="primary"
            @click="menu = false"
          >
            {{ $t('common.find') }}
          </v-btn>
        </v-card-actions>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import PROPERTIES from '/imports/constants/PROPERTIES';
import { getPropertyName } from '/imports/client/ui/i18n/propertyNames';
import escapeRegex from '/imports/api/utility/escapeRegex';

const props = defineProps({
  value: {
    type: Object,
    default: undefined,
  },
  isLibrary: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['input', 'extra-fields-changed']);

const baseFilterOptions = [];
for (let key in PROPERTIES) {
  baseFilterOptions.push({
    title: getPropertyName(key),
    value: key,
  });
}

const typeFilterInput = ref([]);
const fieldFilters = ref([{field: 'name', value: undefined}]);
const menu = ref(false);

const filterOptions = computed(() => {
  return !props.isLibrary
    ? baseFilterOptions.filter(p => p.value !== 'reference')
    : baseFilterOptions;
});

const filter = computed(() => {
  let f = undefined;
  if (typeFilterInput.value?.length) {
    f = f || {};
    f.type = {$in: typeFilterInput.value};
  }
  fieldFilters.value?.forEach(fieldFilter => {
    if (!fieldFilter.field || !fieldFilter.value) return;
    const search = { $regex: escapeRegex(fieldFilter.value), '$options': 'i' };
    f = f || {};
    if (fieldFilter.field.includes('.')) {
      // The user used dot notation, search exactly where they are looking
      f[fieldFilter.field] = search;
    } else {
      // No dot notation, search fields and their likely sub-fields
      f.$and = f.$and || [];
      f.$and.push({
        $or: [
          { [fieldFilter.field]: search },
          { [fieldFilter.field + '.calculation']: search },
          { [fieldFilter.field + '.text']: search },
        ],
      });
    }
  });
  return f;
});

const extraFields = computed(() => {
  let extra = [];
  fieldFilters.value?.forEach(fieldFilter => {
    if (!fieldFilter.field || !fieldFilter.value) return;
    extra.push(fieldFilter.field);
  });
  return extra;
});

const numFilters = computed(() => {
  let count = 0;
  if (typeFilterInput.value?.length) count += 1;
  count += extraFields.value.length;
  return count;
});

watch(menu, (val) => {
  if (!val) {
    emit('input', filter.value);
    emit('extra-fields-changed', extraFields.value);
  }
});
</script>

<style lang="css" scoped>
</style>
