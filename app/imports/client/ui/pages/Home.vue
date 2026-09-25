<template>
  <div
    class="home content d-flex flex-1-1 flex-column justify-space-between"
    style="min-height: 100%;"
  >
    <section
      class="py-12 px-4"
    >
      <v-row
        align="end"
        justify="center"
        class="mb-8"
      >
        <v-col
          class="text-center"
          cols="12"
        >
          <h1 class="text-h4 mb-4">
            {{ $t('home.tagline') }}
          </h1>
          <h4 class="text-subtitle-1">
            {{ $t('home.subtitle') }}
          </h4>
        </v-col>
      </v-row>
      <div
        v-if="!signedIn"
        class="d-flex flex-1-1 align-center justify-center"
      >
        <v-btn
          color="accent"
          rounded
          size="large"
          to="/register"
          class="mr-4"
        >
          {{ $t('home.register') }}
        </v-btn>
        <v-btn
          color="accent"
          rounded
          variant="outlined"
          size="large"
          to="/sign-in"
        >
          {{ $t('home.signIn') }}
        </v-btn>
      </div>
      <div
        v-else
        class="d-flex flex-1-1 align-center justify-center"
      >
        <v-btn
          color="accent"
          rounded
          size="large"
          to="/character-list"
          class="mr-4"
        >
          {{ $t('home.myCharacters') }}
        </v-btn>
      </div>
    </section>
    <section>
      <v-parallax
        src="/images/crown-dice-on-ipad.webp"
        height="300"
      />
    </section>
    <section class="text-center py-8 px-4">
      <div class="d-flex flex-1-1 flex-wrap justify-space-around selling-points">
        <div class="d-flex flex-1-1 flex-column align-center">
          <v-icon
            size="x-large"
            class="ma-2"
          >
            mdi-currency-usd-off
          </v-icon>
          <h3 class="mb-2">
            {{ $t('home.freeTitle') }}
          </h3>
          <p>
            {{ $t('home.freeText') }}
          </p>
        </div>
        <div class="d-flex flex-1-1 flex-column align-center">
          <v-icon
            size="x-large"
            class="ma-2"
          >
            mdi-ballot-outline
          </v-icon>
          <h3 class="mb-2">
            {{ $t('home.customTitle') }}
          </h3>
          <p>
            {{ $t('home.customText') }}
          </p>
        </div>
        <div class="d-flex flex-1-1 flex-column align-center">
          <v-icon
            size="x-large"
            class="ma-2"
          >
            mdi-file-tree-outline
          </v-icon>
          <h3 class="mb-2">
            {{ $t('home.engineTitle') }}
          </h3>
          <p>
            {{ $t('home.engineText') }}
          </p>
        </div>
      </div>
    </section>
    <section class="pa-8">
      <v-row>
        <v-col
          v-for="(card, index) in highlightCards"
          :key="index"
          v-bind="cols"
        >
          <v-card
            tile
            :elevation="0"
          >
            <v-img
              class="text-white align-end"
              :src="'/images/screenshots/' + card.img"
              gradient="to bottom, rgba(0,0,0,0), rgba(0,0,0,.5)"
              height="360px"
              cover
            >
              <v-card-title>
                {{ $t(card.text) }}
              </v-card-title>
            </v-img>
          </v-card>
        </v-col>
      </v-row>
    </section>
    <section class="text-center bg-grey-darken-3 text-white pa-5">
      <h1>
        {{ $t('home.community') }}
      </h1>
      <div class="d-flex flex-1-1 flex-wrap align-center justify-space-around pa-4">
        <v-btn
          v-for="btn in [
            {link: 'https://discord.gg/qEvdfeB', name: 'Discord'},
            {link: 'https://github.com/ThaumRystra/DiceCloud', name: 'Github'},
          ]"
          :key="btn.name"
          :href="btn.link"
          variant="outlined"
          size="large"
          theme="dark"
        >
          {{ btn.name }}
          <v-icon
            end
          >
            mdi-open-in-new
          </v-icon>
        </v-btn>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';

const cols = ref({
  cols: 12,
  sm: 6,
  md: 4,
  lg: 3,
  xl: 2,
});

const highlightCards = ref([
  { text: 'home.highlights.actions', img: 'actions.webp' },
  { text: 'home.highlights.auditable', img: 'auditable.webp' },
  { text: 'home.highlights.dice', img: 'automated-dice-rolls.webp' },
  { text: 'home.highlights.builder', img: 'build-system.webp' },
  { text: 'home.highlights.inventory', img: 'inventory.webp' },
  { text: 'home.highlights.libraries', img: 'libraries-of-content.webp' },
  { text: 'home.highlights.discord', img: 'send-to-discord.webp' },
  { text: 'home.highlights.printing', img: 'printing.webp' },
]);

const signedIn = autorun(() => Meteor.userId()).result;
</script>

<style scoped>
.selling-points>* {
  max-width: 400px;
}
.dark-gradient {
  background: linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%);
}
</style>
