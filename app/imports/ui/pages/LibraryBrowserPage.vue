<template>
  <div
    class="bg-page"
    style="height: 100%"
  >
    <v-container>
      <div class="d-flex flex-wrap align-center ga-3 mb-3">
        <v-text-field
          v-model="search"
          prepend-inner-icon="mdi-magnify"
          :placeholder="$t('library.searchCommunity')"
          :aria-label="$t('library.searchCommunity')"
          variant="outlined"
          density="compact"
          hide-details
          clearable
          class="flex-1-1"
          style="min-width: 220px;"
          data-id="community-search"
        />
        <!-- In the interface's language at first: the EN and FR versions sat side by side (UX13) -->
        <v-btn-toggle
          v-model="languageFilter"
          mandatory
          divided
          border
          rounded="pill"
          density="compact"
          color="primary"
          role="group"
          :aria-label="$t('library.languageFilter')"
          data-id="community-language"
        >
          <v-btn
            v-for="option in languageOptions"
            :key="option.value"
            :value="option.value"
            :aria-pressed="languageFilter === option.value"
            :data-id="`community-language-${option.value}`"
          >
            {{ option.title }}
          </v-btn>
        </v-btn-toggle>
        <v-btn-toggle
          v-model="sort"
          mandatory
          divided
          border
          rounded="pill"
          density="compact"
          color="primary"
          data-id="community-sort"
        >
          <v-btn
            value="popular"
            prepend-icon="mdi-account-multiple-outline"
          >
            {{ $t('library.sortPopular') }}
          </v-btn>
          <v-btn
            value="name"
            prepend-icon="mdi-sort-alphabetical-ascending"
          >
            {{ $t('library.sortName') }}
          </v-btn>
        </v-btn-toggle>
      </div>
      <v-fade-transition mode="out-in">
        <v-row
          v-if="subReady"
          key="loaded-cards"
          density="compact"
        >
          <v-col
            v-for="card in libraryCards"
            :key="card._id"
            cols="12"
            sm="6"
            md="4"
            lg="3"
          >
            <v-card
              class="fill-height d-flex flex-column"
              :class="{ 'community-card--subscribed': card.subscribed }"
              :to="`/library${card._type === 'libraryCollection' ? '-collection' : ''}/${card._id}`"
              :data-id="`community-card-${card._id}`"
            >
              <v-card-item>
                <v-card-title class="text-wrap">
                  {{ card.name }}
                </v-card-title>
                <v-card-subtitle class="d-flex flex-wrap align-center ga-2 mt-1">
                  <v-chip
                    size="x-small"
                    variant="tonal"
                    :prepend-icon="card._type === 'libraryCollection' ? 'mdi-bookshelf' : 'mdi-book-outline'"
                  >
                    {{ card._type === 'libraryCollection' ? $t('library.collection') : $t('library.singleLibrary') }}
                  </v-chip>
                  <v-chip
                    v-if="card.language"
                    size="x-small"
                    variant="outlined"
                    :data-id="`community-card-language-${card._id}`"
                  >
                    {{ $t(`languages.${card.language}`) }}
                  </v-chip>
                  <v-chip
                    v-if="card.recommended"
                    size="x-small"
                    variant="flat"
                    color="primary"
                    prepend-icon="mdi-star"
                    :data-id="`community-card-recommended-${card._id}`"
                  >
                    {{ $t('library.recommended') }}
                  </v-chip>
                  <span v-if="card.subscriberCount">
                    {{ $t('library.subscribers', { count: formatNumber(card.subscriberCount) }) }}
                  </span>
                </v-card-subtitle>
              </v-card-item>
              <v-card-text
                v-if="card.summary"
                class="community-card__summary pt-0"
              >
                {{ card.summary }}
              </v-card-text>
              <v-spacer />
              <v-card-actions>
                <smart-btn
                  :variant="card.subscribed ? 'tonal' : 'flat'"
                  color="primary"
                  :prepend-icon="card.subscribed ? 'mdi-check' : 'mdi-plus'"
                  single-click
                  :data-id="`community-subscribe-${card._id}`"
                  @click="ack => changeSubscribe(card, ack)"
                >
                  {{ card.subscribed ? $t('library.subscribed') : $t('library.subscribe') }}
                </smart-btn>
                <v-spacer />
                <v-btn
                  variant="text"
                  append-icon="mdi-arrow-right"
                  :to="`/library${card._type === 'libraryCollection' ? '-collection' : ''}/${card._id}`"
                >
                  {{ $t('library.open') }}
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-col>
          <v-col
            v-if="!libraryCards.length"
            cols="12"
          >
            <v-empty-state
              icon="mdi-magnify-remove-outline"
              :title="$t('library.noCommunityMatch')"
            />
          </v-col>
        </v-row>
        <v-row
          v-else
          key="loading-spinner"
        >
          <v-col
            cols="12"
            class="d-flex align-center justify-center"
          >
            <v-progress-circular
              indeterminate
              color="primary"
              size="64"
            />
          </v-col>
        </v-row>
      </v-fade-transition>
    </v-container>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { orderBy } from 'lodash';
import { Meteor } from 'meteor/meteor';
import { autorun, subscribe } from 'vue-meteor-tracker';

import LibraryCollections from '/imports/api/library/LibraryCollections';
import Libraries from '/imports/api/library/Libraries';
import firstSentence from '/imports/ui/utility/firstSentence';
import formatter from '/imports/ui/utility/numberFormatter';
import { useI18n } from 'vue-i18n';
import libraryLanguage, { LIBRARY_LANGUAGES, matchesLanguage } from '/imports/api/library/libraryLanguage';

const { t, locale } = useI18n();


const { ready: browseLibrariesReady } = subscribe('browseLibraries');
const subReady = computed(() => browseLibrariesReady.value);

const collections = autorun(() => {
  const user = Meteor.user() || {};
  const subCollections = user.subscribedLibraryCollections || [];
  return LibraryCollections.find({
    showInMarket: true,
    public: true,
  }, {
    sort: { subscriberCount: 1, name: 1 }
  }).map(col => {
    col.subscribed = subCollections.includes(col._id);
    col._type = 'libraryCollection';
    return col;
  });
}).result;

const libraries = autorun(() => {
  const user = Meteor.user() || {};
  const subLibraries = user.subscribedLibraries || [];
  return Libraries.find({
    showInMarket: true,
    public: true,
  }, {
    sort: { subscriberCount: 1, name: 1 }
  }).map(lib => {
    lib.subscribed = subLibraries.includes(lib._id);
    lib._type = 'library';
    return lib;
  });
}).result;

const search = ref('');
const sort = ref('popular');

// The interface's language first; a library whose language cannot be told shows under each
const languageFilter = ref(LIBRARY_LANGUAGES.includes(locale.value) ? locale.value : 'all');
const languageOptions = computed(() => [
  ...LIBRARY_LANGUAGES.map(language => ({ title: t(`languages.${language}`), value: language })),
  { title: t('library.allLanguages'), value: 'all' },
]);

// Searched by name and description, then sorted; each card shows the first
// sentence of its description rather than all of it
const libraryCards = computed(() => {
  const term = (search.value || '').trim().toLowerCase();
  const cards = [...(libraries.value || []), ...(collections.value || [])]
    .filter(card => matchesLanguage(card, languageFilter.value))
    .filter(card => !term
      || card.name?.toLowerCase().includes(term)
      || card.description?.toLowerCase().includes(term))
    .map(card => ({
      ...card,
      language: libraryLanguage(card),
      summary: firstSentence(card.description, 200),
    }));
  // The recommended ones first, unless sorted by name
  return sort.value === 'name'
    ? orderBy(cards, [card => card.name?.toLowerCase()], ['asc'])
    : orderBy(cards, [card => !!card.recommended, 'subscriberCount', 'name'], ['desc', 'desc', 'asc']);
});

function formatNumber(num) {
  return formatter.format(num);
}

async function changeSubscribe(card, ack) {
  const id = card._id;
  const subscribe = !card.subscribed;

  if (card._type === 'library') {
    try {
      await Meteor.users.subscribeToLibrary.callAsync({ libraryId: id, subscribe });
      ack();
    } catch (error) {
      ack(error);
    }
  } else if (card._type === 'libraryCollection') {
    try {
      await Meteor.users.subscribeToLibraryCollection.callAsync({
        libraryCollectionId: id,
        subscribe,
      });
      ack();
    } catch (error) {
      ack(error);
    }
  } else {
    ack(t('library.notFound'));
  }
}
</script>

<style scoped>
/* A few lines of summary: the card opens the whole description */
.community-card__summary {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* A subscribed card keeps an outline in the primary colour */
.community-card--subscribed {
  outline: 2px solid rgb(var(--v-theme-primary));
}
</style>
