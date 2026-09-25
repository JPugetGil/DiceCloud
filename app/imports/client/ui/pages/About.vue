<template>
  <div>
    <section>
      <v-parallax
        src="/images/paper-dice-crown.webp"
        height="300"
      >
        <div class="d-flex flex-1-1 flex-column align-center justify-center text-white">
          <p
            class="text-white ma-2 text-center"
            style="max-width: 1200px;"
          >
            {{ $t('about.intro') }}
          </p>
        </div>
      </v-parallax>
    </section>
    <section class="d-flex flex-1-1 flex-column align-center ma-2 mt-4">
      <div>
        <h3 class="text-h5 mb-2">
          {{ $t('about.specialThanks') }}
        </h3>
        <p>
          <b>Sam;</b> {{ $t('about.samThanks') }}
        </p><p>
          <b>{{ $t('about.heroes') }}</b> {{ $t('about.heroesThanks') }}
        </p>
        <h3 class="text-h6">
          {{ $t('about.supporters') }}
        </h3>
        <v-list
          avatar
          lines="two"
          style="background: inherit;"
        >
          <v-list-item
            v-for="paragon in paragons"
            :key="paragon.name"
          >
            <template #prepend>
              <v-avatar>
                <v-img
                  cover
                  :src="`/images/paragons/${paragon.avatar}.png`"
                />
              </v-avatar>
            </template>

            <v-list-item-title>
              {{ paragon.name }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ paragon.title }}
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const paragons = ref([{
    name: 'Kira Ametrine',
    title: 'Cleric of Lewd',
    avatar: 'kira'
  },{
    name: 'Satherian',
    title: 'Defender of Naptime',
    avatar: 'satherian'
  },{
    name: 'Vinton',
    title: 'The Gravekeeper',
    avatar: 'vinton'
  },{
    name: 'Lord of Junk',
    title: 'Archwizard of the Odd',
    avatar: 'lordOfJunk'
  },{
    name: 'Dai',
    title: 'A Kobold\'s Best Friend',
    avatar: 'dai'
  }, {
    name: 'Vibes',
    title: 'Kell of Nothing',
    avatar: 'vibes'
  }, {
    name: 'ßlue',
    title: 'Embodiment of Greed',
    avatar: 'blue'
  },
]);
</script>

<style lang="css" scoped>
</style>
