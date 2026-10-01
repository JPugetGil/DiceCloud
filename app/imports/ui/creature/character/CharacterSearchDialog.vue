<template>
  <dialog-base>
    <template #toolbar>
      <v-text-field
        v-model="search"
        autofocus
        clearable
        hide-details
        single-line
        variant="outlined"
        density="compact"
        prepend-inner-icon="mdi-magnify"
        class="mr-4"
        data-id="character-search-input"
        :placeholder="$t('characterSearch.placeholder')"
        :aria-label="$t('characterSearch.placeholder')"
        @keydown.enter="results[0] && open(results[0])"
      />
    </template>
    <template #unwrapped-content>
      <v-empty-state
        v-if="!query"
        icon="mdi-magnify"
        :text="$t('characterSearch.hint')"
      />
      <v-empty-state
        v-else-if="!results.length"
        icon="mdi-magnify-close"
        :title="$t('characterSearch.noMatch', { search: search.trim() })"
      />
      <v-list
        v-else
        data-id="character-search-results"
      >
        <v-list-item
          v-for="result in results"
          :key="result._id"
          :data-id="`search-result-${result._id}`"
          @click="open(result)"
        >
          <template #prepend>
            <v-avatar>
              <property-icon
                :model="result"
                :color="result.color"
              />
            </v-avatar>
          </template>
          <v-list-item-title>
            {{ result.title }}
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ result.subtitle }}
          </v-list-item-subtitle>
        </v-list-item>
        <v-list-item
          v-if="moreCount"
          disabled
          :subtitle="$t('characterSearch.more', { count: moreCount }, moreCount)"
        />
      </v-list>
    </template>
  </dialog-base>
</template>

<script setup>
import { ref, computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import DialogBase from '/imports/ui/dialogStack/DialogBase.vue';
import PropertyIcon from '/imports/ui/properties/shared/PropertyIcon.vue';
import { getPropertyName } from '/imports/ui/i18n/propertyNames';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const MAX_RESULTS = 50;

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
});

const dialogStackStore = useDialogStackStore();

const search = ref('');

// Case and accents do not count: "epee" finds "Épée"
const normalize = text => (text || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const query = computed(() => normalize(search.value).trim());

const properties = autorun(() => CreatureProperties.find({
  ...getFilter.descendantsOfRoot(props.creatureId),
  removed: { $ne: true },
}, {
  fields: {
    name: 1, type: 1, parentId: 1, left: 1, icon: 1, color: 1, showUI: 1,
    attributeType: 1, skillType: 1, 'summary.text': 1, 'description.text': 1,
  },
  sort: { left: 1 },
}).fetch()).result;

const byId = computed(() => new Map((properties.value || []).map(prop => [prop._id, prop])));

// Folders and slots build the sheet rather than being on it; utility
// attributes and skills, and toggles without a switch, are never shown
const found = prop => !['folder', 'propertySlot'].includes(prop.type)
  && prop.attributeType !== 'utility' && prop.skillType !== 'utility'
  && (prop.type !== 'toggle' || prop.showUI);

// Names that start with the search first, then names with a word that does,
// then names that hold it, then summaries and descriptions that do
function rank(prop) {
  const name = normalize(prop.name);
  if (name.startsWith(query.value)) return 0;
  if (name.includes(` ${query.value}`)) return 1;
  if (name.includes(query.value)) return 2;
  if (normalize(prop.summary?.text).includes(query.value)
    || normalize(prop.description?.text).includes(query.value)) return 3;
}

const matches = computed(() => {
  if (!query.value) return [];
  return (properties.value || [])
    .filter(found)
    .map(prop => ({ prop, rank: rank(prop) }))
    .filter(match => match.rank !== undefined)
    .sort((a, b) => a.rank - b.rank || a.prop.left - b.prop.left);
});

const results = computed(() => matches.value.slice(0, MAX_RESULTS).map(({ prop }) => {
  const parent = byId.value.get(prop.parentId);
  return {
    ...prop,
    title: prop.name || getPropertyName(prop.type),
    // Its type, and what it belongs to: the class, item or folder it is under
    subtitle: [getPropertyName(prop.type), parent?.name].filter(Boolean).join(' · '),
  };
}));

const moreCount = computed(() => Math.max(matches.value.length - MAX_RESULTS, 0));

function open(result) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `search-result-${result._id}`,
    data: { _id: result._id },
  });
}
</script>
