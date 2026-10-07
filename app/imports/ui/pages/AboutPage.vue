<template>
  <div>
    <section>
      <v-parallax
        alt=""
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
      <div class="about__content">
        <h3 class="text-headline-small mb-2 mt-0">
          {{ $t('about.specialThanks') }}
        </h3>
        <p class="my-0">
          <b>Sam;</b> {{ $t('about.samThanks') }}
        </p><p class="my-0">
          <b>{{ $t('about.heroes') }}</b> {{ $t('about.heroesThanks') }}
        </p>
        <h3 class="text-title-large my-0">
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
                  alt=""
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
        <!--
          What the licences of the content DiceCloud distributes ask of it:
          the libraries' licences and the monsters' footers link here
        -->
        <h3
          id="licenses"
          class="text-title-large my-0"
        >
          {{ $t('about.licenses') }}
        </h3>
        <section
          class="about__licenses"
          data-id="srd-attribution"
        >
          <h4 class="text-title-medium mb-1 mt-2">
            {{ $t('about.srdTitle') }}
          </h4>
          <p class="my-2">
            {{ $t('about.srdIntro') }}
          </p>
          <!--
            The attribution statement each edition's legal page fixes, verbatim,
            in its own language; the interface's edition first. The SRD asks
            for no other attribution to its publisher
          -->
          <figure
            v-for="edition in srdEditions"
            :key="edition.lang"
            class="about__statement my-2"
            :data-id="`srd-attribution-${edition.lang}`"
          >
            <figcaption class="text-label-large">
              {{ $t(edition.label) }}
            </figcaption>
            <!-- On one line: the text between the links keeps its exact spaces -->
            <!-- eslint-disable-next-line vue/singleline-html-element-content-newline, vue/max-attributes-per-line -->
            <blockquote :lang="edition.lang" class="my-1"><template v-for="(part, index) in linkParts($t(edition.statement))" :key="index"><a v-if="part.href" :href="part.href" target="_blank" rel="noopener">{{ part.text }}</a><template v-else>{{ part.text }}</template></template></blockquote>
          </figure>
          <p
            class="my-2"
            data-id="srd-disclaimer"
          >
            {{ $t('about.srdDisclaimerIntro', { quote: $t('about.srdDisclaimer') }) }}
          </p>
          <p
            class="my-2"
            data-id="srd-changes"
          >
            {{ $t('about.srdChanges') }}
          </p>
          <h4 class="text-title-medium mb-1 mt-4">
            {{ $t('about.iconsTitle') }}
          </h4>
          <!-- CC BY 3.0 asks for the authors, the source and the license -->
          <i18n-t
            keypath="about.iconsCredit"
            scope="global"
            tag="p"
            class="my-2"
            data-id="icons-credit"
          >
            <template #site>
              <a
                href="https://game-icons.net/"
                target="_blank"
                rel="noopener"
              >game-icons.net</a>
            </template>
            <template #license>
              <a
                :href="$t('about.iconsLicenseUrl')"
                target="_blank"
                rel="noopener license"
              >{{ $t('about.iconsLicense') }}</a>
            </template>
          </i18n-t>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { locale } = useI18n();

// The SRD 5.1's two editions, the interface's own first
const srdEditions = computed(() => {
  const editions = [
    { lang: 'en', label: 'about.srdEnglish', statement: 'about.srdAttributionEn' },
    { lang: 'fr', label: 'about.srdFrench', statement: 'about.srdAttributionFr' },
  ];
  return locale.value === 'fr' ? editions.reverse() : editions;
});

// A statement's text, its addresses as links (the full stop after one stays text)
function linkParts(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(/https?:\/\/\S+?(?=\.?(?:\s|$))/g)) {
    parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: match[0], href: match[0] });
    last = match.index + match[0].length;
  }
  parts.push({ text: text.slice(last) });
  return parts.filter(part => part.text);
}

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
.about__content {
  max-width: 100%;
}

.about__licenses {
  max-width: 760px;
}

/* The statements' addresses break anywhere: whole, they widened a phone's page */
.about__statement blockquote {
  overflow-wrap: anywhere;
}

/* The width of the text: a figure and a quotation are indented 40px each by default */
.about__statement,
.about__statement blockquote {
  margin-inline: 0;
}

.about__statement blockquote {
  border-inline-start: 3px solid rgba(var(--v-theme-on-surface), 0.24);
  padding-inline-start: 12px;
}
</style>
