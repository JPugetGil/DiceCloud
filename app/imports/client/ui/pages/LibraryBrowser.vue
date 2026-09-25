<template>
  <div
    class="card-background"
    style="height: 100%"
  >
    <v-container>
      <v-fade-transition mode="out-in">
        <v-row
          v-if="subReady"
          key="loaded-cards"
          dense
        >
          <v-col
            v-for="card in libraryCards"
            :key="card._id"
            cols="12"
            sm="6"
            md="4"
            lg="3"
          >
            <v-sheet
              class="fill-height"
              rounded
              border
              :color="card.subscribed ? 'accent': ''"
            >
              <v-card
                class="fill-height d-flex flex-column"
                elevation="0"
                :to="`/library${card._type === 'libraryCollection' ? '-collection' : ''}/${card._id}`"
              >
                <v-card-title>
                  {{ card.name }}
                </v-card-title>
                <v-card-subtitle v-if="card.subscriberCount">
                  {{ $t('library.subscribers', { count: formatNumber(card.subscriberCount) }) }}
                </v-card-subtitle>
                <v-card-text>
                  <markdown-text :markdown="card.description" />
                </v-card-text>
                <v-spacer />
                <v-card-actions>
                  <v-spacer />
                  <smart-btn
                    variant="text"
                    single-click
                    :color="card.subscribed ? '': 'accent'"
                    @click="ack => changeSubscribe(card, ack)"
                  >
                    {{ card.subscribed ? $t('library.unsubscribe') : $t('library.subscribe') }}
                  </smart-btn>
                </v-card-actions>
              </v-card>
            </v-sheet>
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
import {computed } from 'vue';
import { orderBy } from 'lodash';
import { Meteor } from 'meteor/meteor';
import { autorun, subscribe } from 'vue-meteor-tracker';

import LibraryCollections from '/imports/api/library/LibraryCollections';
import Libraries from '/imports/api/library/Libraries';
import MarkdownText from '/imports/client/ui/components/MarkdownText.vue';
import formatter from '/imports/client/ui/utility/numberFormatter';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();


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

const libraryCards = computed(() => {
  return orderBy([...(libraries.value || []), ...(collections.value || [])], ['subscriberCount', 'name'], ['desc', 'asc']);
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
