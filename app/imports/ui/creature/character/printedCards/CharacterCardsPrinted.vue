<template>
  <div class="character-cards-printed">
    <div
      v-if="!ready"
      class="fill-height d-flex flex-1-1 justify-center align-center pa-12 no-print"
    >
      <v-progress-circular
        indeterminate
        color="primary"
        size="64"
      />
    </div>
    <div
      v-else-if="!creature"
      class="d-flex flex-column align-center pa-12"
    >
      <h2>{{ $t('sheet.notFound') }}</h2>
      <h3>{{ $t('sheet.notFoundText') }}</h3>
    </div>
    <template v-else>
      <!-- The choices, on screen only: nothing is written to the character -->
      <v-card
        class="cards-controls no-print ma-4"
        max-width="900"
      >
        <v-card-text>
          <div class="d-flex flex-wrap ga-4 align-center">
            <v-btn-toggle
              :model-value="selection.paper"
              mandatory
              density="comfortable"
              variant="outlined"
              divided
              :aria-label="$t('printCards.paper')"
              @update:model-value="value => setQuery('paper', value)"
            >
              <v-btn value="a4">
                {{ $t('printCards.a4') }}
              </v-btn>
              <v-btn value="letter">
                {{ $t('printCards.letter') }}
              </v-btn>
            </v-btn-toggle>
            <div
              class="text-body-medium"
              data-id="print-cards-count"
            >
              {{ $t('printCards.cardCount', cards.length) }}
              {{ $t('printCards.sheetCount', sheets.length) }}
            </div>
          </div>
          <div class="cards-controls__selects mt-4">
            <v-select
              :model-value="selection.spells"
              :items="spellModes"
              :label="$t('printCards.spells')"
              density="compact"
              hide-details
              @update:model-value="value => setQuery('spells', value)"
            />
            <v-select
              :model-value="selection.list || ''"
              :items="listItems"
              :label="$t('printCards.spellList')"
              :disabled="selection.spells === 'none'"
              density="compact"
              hide-details
              @update:model-value="value => setQuery('list', value)"
            />
            <v-select
              :model-value="selection.items"
              :items="itemModes"
              :label="$t('printCards.items')"
              density="compact"
              hide-details
              @update:model-value="value => setQuery('items', value)"
            />
            <v-select
              :model-value="selection.container || ''"
              :items="containerItems"
              :label="$t('printCards.container')"
              :disabled="selection.items === 'none'"
              density="compact"
              hide-details
              @update:model-value="value => setQuery('container', value)"
            />
          </div>
          <div class="d-flex flex-wrap ga-x-6 mt-2">
            <v-switch
              :model-value="selection.backs"
              :label="$t('printCards.backs')"
              :hint="$t('printCards.backsHint')"
              persistent-hint
              color="primary"
              density="compact"
              data-id="print-cards-backs"
              @update:model-value="value => setQuery('backs', value ? '1' : undefined)"
            />
            <v-switch
              :model-value="selection.double"
              :label="$t('printCards.double')"
              color="primary"
              density="compact"
              hide-details
              data-id="print-cards-double"
              @update:model-value="value => setQuery('double', value ? '1' : undefined)"
            />
            <v-switch
              :model-value="selection.colors"
              :label="$t('printCards.colors')"
              color="primary"
              density="compact"
              hide-details
              @update:model-value="value => setQuery('colors', value ? undefined : '0')"
            />
          </div>
          <v-expansion-panels
            class="mt-2"
            variant="accordion"
          >
            <v-expansion-panel data-id="print-cards-choose">
              <v-expansion-panel-title>
                {{ $t('printCards.choose', { count: models.length, total: allModels.length }) }}
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="d-flex ga-2 mb-2">
                  <v-btn
                    size="small"
                    variant="tonal"
                    @click="setSkipped([])"
                  >
                    {{ $t('printCards.selectAll') }}
                  </v-btn>
                  <v-btn
                    size="small"
                    variant="tonal"
                    @click="setSkipped(allModels.map(model => model.id))"
                  >
                    {{ $t('printCards.selectNone') }}
                  </v-btn>
                </div>
                <div class="cards-choice">
                  <v-checkbox
                    v-for="model in allModels"
                    :key="model.key"
                    :model-value="!skipped.has(model.id)"
                    :label="model.choiceLabel"
                    density="compact"
                    hide-details
                    @update:model-value="value => toggleSkipped(model.id, !value)"
                  />
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
          <v-alert
            class="mt-4"
            type="info"
            variant="tonal"
            density="compact"
          >
            {{ $t('printCards.scaleReminder') }}
          </v-alert>
        </v-card-text>
      </v-card>

      <div
        v-if="!models.length && !building"
        class="no-print text-center pa-8"
      >
        {{ $t('printCards.empty') }}
      </div>
      <div
        v-else-if="laying"
        class="no-print text-center pa-8"
      >
        <v-progress-circular
          indeterminate
          color="primary"
          class="mb-2"
        />
        <div>{{ $t('printCards.laying') }}</div>
      </div>

      <div
        class="card-sheets"
        :style="previewZoom"
      >
        <section
          v-for="(sheet, index) in renderedSheets"
          :key="index"
          class="card-sheet"
          :class="{ 'card-sheet--back': sheet.back }"
          :data-side="sheet.back ? 'back' : 'front'"
          :style="sheetStyle"
        >
          <div
            class="card-grid"
            :style="gridStyle"
          >
            <printed-card
              v-for="cell in sheet.cells"
              :key="`${cell.card.card.key}-${cell.card.part}`"
              :style="{ gridRow: cell.row + 1, gridColumn: `${cell.col + 1} / span ${cell.span}` }"
              :card="cell.card.card"
              :part="cell.card.part"
              :parts="cell.card.parts"
              :font-size="cell.card.fontSize"
              :html="cell.card.html"
              :span="cell.span"
              :back="sheet.back"
            />
          </div>
          <svg
            class="crop-marks"
            :viewBox="`0 0 ${paperSize.width} ${paperSize.height}`"
            :width="`${paperSize.width}mm`"
            :height="`${paperSize.height}mm`"
            aria-hidden="true"
          >
            <line
              v-for="(mark, markIndex) in marks"
              :key="markIndex"
              :x1="mark.x1"
              :y1="mark.y1"
              :x2="mark.x2"
              :y2="mark.y2"
            />
          </svg>
        </section>
      </div>

      <!--
        Off screen, at print size: each card's first and continuation card,
        single and (on request) double, for the layout to measure
      -->
      <div
        ref="measureRoot"
        class="cards-measure"
        aria-hidden="true"
      >
        <template
          v-for="model in models"
          :key="model.key"
        >
          <printed-card
            :card="model"
            :part="1"
            :parts="2"
            :html="model.bodyHtml"
            :data-measure="`${model.key}:first`"
          />
          <printed-card
            :card="model"
            :part="2"
            :parts="2"
            :data-measure="`${model.key}:next`"
          />
          <template v-if="selection.double">
            <printed-card
              :card="model"
              :part="1"
              :parts="2"
              :span="2"
              :data-measure="`${model.key}:first-double`"
            />
            <printed-card
              :card="model"
              :part="2"
              :parts="2"
              :span="2"
              :data-measure="`${model.key}:next-double`"
            />
          </template>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import { useDisplay } from 'vuetify';
import DOMPurify from 'dompurify';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import markdownToHtml from '/imports/ui/utility/markdownToHtml';
import { translateOr } from '/imports/ui/i18n';
import useUnits from '/imports/ui/composables/useUnits';
import { useAppStore } from '/imports/ui/stores/app';
import PrintedCard from './PrintedCard.vue';
import { Meteor } from 'meteor/meteor';
import tonalSurface, { toneOf } from '/imports/ui/utility/tonal.mjs';
import { guessLanguage } from '/imports/api/library/rulesets';
import {
  PAPERS, paperMargins, defaultPaper, cropMarks, nearestAncestor, selectSpells,
  selectItems, itemRarity, itemCharges, spellUses, componentCodes, capitalizeFirst,
  itemKind, packCards, mirrorPlacement, cardColor,
} from './cardLogic';
import { SCHOOL_ICONS, ITEM_ICONS } from './cardIcons';
import { layoutCardBody, prepareCardHtml } from './cardText';
import resolveInlineText, { spellScope } from './resolveInlineText';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const appStore = useAppStore();
const { formatQuantity } = useUnits();

// Through a computed: closing a dialog re-emits the route's params
const creatureId = computed(() => route.params.id);
const { ready } = subscribe(() => ['singleCharacter', creatureId.value]);

const creature = autorun(() => Creatures.findOne(creatureId.value)).result;
const variables = autorun(() => CreatureVariables.findOne({ _creatureId: creatureId.value }) || {}).result;

const properties = autorun(() => CreatureProperties.find({
  ...getFilter.descendantsOfRoot(creatureId.value),
  type: { $in: ['spell', 'spellList', 'item', 'container', 'attribute', 'action'] },
  removed: { $ne: true },
}, {
  sort: { left: 1 },
}).fetch()).result;

const ofType = type => computed(() => (properties.value || []).filter(prop => prop.type === type));
const spells = ofType('spell');
const spellLists = ofType('spellList');
const items = ofType('item');
const containers = ofType('container');

// The choices live in the address: ?paper=a4&spells=all&list=<id>&items=carried&container=<id>
// &skip=<id>,<id> (cards unticked) &backs=1 &double=1 &colors=0
const SPELL_MODES = ['prepared', 'all', 'none'];
const ITEM_MODES = ['equipped', 'carried', 'all', 'none'];
const selection = computed(() => {
  const query = route.query;
  return {
    paper: query.paper in PAPERS ? query.paper : defaultPaper(navigator.language),
    spells: SPELL_MODES.includes(query.spells) ? query.spells : 'prepared',
    list: typeof query.list === 'string' && query.list ? query.list : undefined,
    items: ITEM_MODES.includes(query.items) ? query.items : 'equipped',
    container: typeof query.container === 'string' && query.container ? query.container : undefined,
    backs: query.backs === '1',
    double: query.double === '1',
    colors: query.colors !== '0',
  };
});

function setQuery(key, value) {
  router.replace({ query: { ...route.query, [key]: value || undefined } });
}

// Cards picked by hand: the ones unticked, by property id
const skipped = computed(() => new Set(typeof route.query.skip === 'string'
  ? route.query.skip.split(',').filter(Boolean) : []));
function setSkipped(ids) {
  setQuery('skip', [...new Set(ids)].join(','));
}
function toggleSkipped(id, skip) {
  const ids = new Set(skipped.value);
  if (skip) ids.add(id);
  else ids.delete(id);
  setSkipped([...ids]);
}

const spellModes = computed(() => [
  { title: t('printCards.spellsPrepared'), value: 'prepared' },
  { title: t('printCards.spellsAll'), value: 'all' },
  { title: t('printCards.spellsNone'), value: 'none' },
]);
const itemModes = computed(() => [
  { title: t('printCards.itemsEquipped'), value: 'equipped' },
  { title: t('printCards.itemsCarried'), value: 'carried' },
  { title: t('printCards.itemsAll'), value: 'all' },
  { title: t('printCards.itemsNone'), value: 'none' },
]);
const listItems = computed(() => [
  { title: t('printCards.allLists'), value: '' },
  ...spellLists.value.map(list => ({ title: list.name || t('propertyTypes.spellList.name'), value: list._id })),
]);
const containerItems = computed(() => [
  { title: t('printCards.anywhere'), value: '' },
  ...containers.value.map(container => ({ title: container.name || t('propertyTypes.container.name'), value: container._id })),
]);

const selectedSpells = computed(() => selectSpells(spells.value, {
  mode: selection.value.spells,
  listId: selection.value.list,
  lists: spellLists.value,
}).sort((a, b) => (a.level ?? 0) - (b.level ?? 0)
  || (a.name || '').localeCompare(b.name || '', locale.value)));

const selectedItems = computed(() => selectItems(items.value, containers.value, {
  mode: selection.value.items,
  containerId: selection.value.container,
}));

const numberFormat = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }));
const formatNumber = number => numberFormat.value.format(number);

// Summary and description as the engine computed them (`.value`: inline
// calculations worked out), as one block of card HTML
function bodyHtml(...fields) {
  const markdown = fields
    .map(field => typeof field?.value === 'string' ? field.value : field?.text)
    .filter(text => typeof text === 'string' && text.trim())
    .join('\n\n');
  if (!markdown) return '';
  return prepareCardHtml(DOMPurify.sanitize(markdownToHtml(markdown)));
}

const restNote = reset => (reset === 'longRest' || reset === 'shortRest')
  ? t(`printCards.reset.${reset}`) : undefined;

// A card's colour as the app's tonal surfaces give it; none when off
function band(color) {
  if (!selection.value.colors || !color) return undefined;
  const surface = tonalSurface(color, false);
  return surface && { ...surface, tint: toneOf(color, 96) };
}

// The language each property's text is written in: that of the library it
// came from (UX13), asked once per set of library nodes; else a guess from
// the text itself. Words then break by the text's rules, not the interface's
const nodeLanguages = ref({});
watch(
  () => [...new Set((properties.value || []).map(prop => prop.libraryNodeId).filter(Boolean))].sort().join(','),
  async (ids) => {
    const missing = ids ? ids.split(',').filter(id => !(id in nodeLanguages.value)) : [];
    if (!missing.length) return;
    try {
      const languages = await Meteor.callAsync('libraries.nodeLanguages', { nodeIds: missing });
      nodeLanguages.value = {
        ...nodeLanguages.value,
        ...Object.fromEntries(missing.map(id => [id, languages?.[id] || ''])),
      };
    } catch (error) {
      console.warn(error);
    }
  },
  { immediate: true },
);
const textLanguage = (prop, ...texts) => nodeLanguages.value[prop.libraryNodeId]
  || guessLanguage(texts.filter(Boolean).join('\n')) || undefined;

async function spellCard(spell) {
  const list = nearestAncestor(spell, spellLists.value);
  const text = value => resolveInlineText(value, variables.value, spellScope(spell), { formatNumber })
    .then(capitalizeFirst);
  const [castingTime, range, duration, material] = await Promise.all([
    text(spell.castingTime), text(spell.range), text(spell.duration), text(spell.material),
  ]);
  const school = spell.school ? translateOr(`spellSchools.${spell.school}`, spell.school) : '';
  const subtitle = spell.level ? t('printCards.spellLevel', { level: spell.level, school })
    : t('printCards.cantrip', { school }).replace(/^,\s*/, '');
  const dc = list?.dc?.value;
  const attack = spell.attackRoll?.value;
  // The libraries roll more than attacks with it: Counterspell's ability
  // check is `#spellList.abilityMod`. An attack adds the spell attack bonus
  const isAttack = /attackRollBonus/.test(spell.attackRoll?.calculation || '');
  const uses = spellUses(spell);
  const title = spell.name || t('propertyTypes.spell.name');
  return {
    key: `spell-${spell._id}`,
    id: spell._id,
    kind: 'spell',
    choiceLabel: `${title} (${spell.level ? spell.level : t('printCards.cantripShort')})`,
    icon: SCHOOL_ICONS[spell.school],
    band: band(cardColor({ list, creature: creature.value })),
    lang: textLanguage(spell, spell.name, spell.description?.text, spell.summary?.text),
    title,
    subtitle: capitalizeFirst(subtitle.trim()),
    badges: [
      spell.concentration && t('printCards.concentration'),
      spell.ritual && t('printCards.ritual'),
    ].filter(Boolean),
    stats: [
      { label: t('printCards.castingTime'), value: castingTime || '—' },
      { label: t('printCards.range'), value: range || '—' },
      { label: t('printCards.components'), value: componentCodes(spell).join(', ') || '—' },
      { label: t('printCards.duration'), value: duration || '—' },
    ],
    lead: material ? t('printCards.material', { material }) : undefined,
    bodyHtml: bodyHtml(spell.summary, spell.description),
    boxes: uses && { label: t('printCards.uses'), count: uses.max, note: restNote(uses.reset) },
    footerLeft: [
      list?.name,
      Number.isFinite(dc) && t('printCards.dc', { dc }),
      Number.isFinite(attack)
        && t(isAttack ? 'printCards.attack' : 'printCards.roll', { bonus: numberToSignedString(attack) }),
    ].filter(Boolean).join(' · '),
    footerRight: spell.alwaysPrepared ? t('printCards.alwaysPrepared')
      : spell.prepared && spell.level ? t('printCards.prepared') : '',
  };
}

function itemCard(item) {
  const rarity = itemRarity(item.tags);
  const charges = itemCharges(item, properties.value);
  const container = nearestAncestor(item, containers.value);
  const stats = [
    Number.isFinite(item.weight) && item.weight > 0
      && { label: t('printCards.weight'), value: formatQuantity(item.weight, 'weight') },
    Number.isFinite(item.value) && item.value > 0
      && { label: t('printCards.value'), value: t('printCards.gp', { value: formatNumber(item.value) }) },
  ].filter(Boolean);
  const title = (item.quantity > 1 && item.plural) || item.name || t('propertyTypes.item.name');
  return {
    key: `item-${item._id}`,
    id: item._id,
    kind: 'item',
    choiceLabel: title,
    icon: ITEM_ICONS[itemKind(item.tags)],
    band: band(cardColor({ creature: creature.value })),
    lang: textLanguage(item, item.name, item.description?.text),
    title,
    quantity: item.quantity > 1 ? t('printCards.quantity', { count: item.quantity }) : undefined,
    subtitle: [
      rarity && t(`printCards.rarity.${rarity}`),
      item.requiresAttunement && t('attunement.required'),
    ].filter(Boolean).join(' · '),
    badges: [],
    stats,
    bodyHtml: bodyHtml(item.description),
    boxes: charges && { label: t('printCards.charges'), count: charges.max, note: restNote(charges.reset) },
    footerLeft: container?.name || '',
    footerRight: [
      item.equipped && t('printCards.equipped'),
      item.attuned && t('attunement.attuned'),
    ].filter(Boolean).join(' · '),
  };
}

// The cards' content: rebuilt when the selection, the character or the
// language changes. Async for the inline calculations of the spells.
const allModels = ref([]);
const building = ref(false);
let buildRun = 0;
watch(
  () => [selectedSpells.value, selectedItems.value, variables.value, spellLists.value, locale.value,
    selection.value.colors, creature.value?.color, nodeLanguages.value],
  async () => {
    const run = ++buildRun;
    building.value = true;
    try {
      const built = [
        ...await Promise.all(selectedSpells.value.map(spellCard)),
        ...selectedItems.value.map(itemCard),
      ];
      if (run === buildRun) allModels.value = built;
    } finally {
      if (run === buildRun) building.value = false;
    }
  },
  { immediate: true },
);
// Those ticked
const models = computed(() => allModels.value.filter(model => !skipped.value.has(model.id)));

// The layout: each card measured off screen once the fonts are in
const measureRoot = ref(null);
const cards = ref([]);
const laying = ref(false);
let layoutRun = 0;
// Also when the measuring area mounts: the content can be ready before it
watch([models, measureRoot, () => selection.value.double], async () => {
  const run = ++layoutRun;
  laying.value = true;
  try {
    await nextTick();
    await document.fonts?.ready;
    if (run !== layoutRun || !measureRoot.value) return;
    const laid = [];
    for (const model of models.value) {
      const first = measureRoot.value.querySelector(`[data-measure="${model.key}:first"]`);
      const next = measureRoot.value.querySelector(`[data-measure="${model.key}:next"]`);
      if (!first || !next) continue;
      // Not laid out: nothing to measure, the cards stay as they were
      if (!first.offsetHeight || !next.offsetHeight) return;
      let parts = layoutCardBody(model.bodyHtml, first, next);
      let span = 1;
      // A text that needs continuation cards goes on a double card instead, if asked
      const firstDouble = measureRoot.value.querySelector(`[data-measure="${model.key}:first-double"]`);
      const nextDouble = measureRoot.value.querySelector(`[data-measure="${model.key}:next-double"]`);
      if (parts.length > 1 && selection.value.double && firstDouble?.offsetHeight && nextDouble) {
        parts = layoutCardBody(model.bodyHtml, firstDouble, nextDouble, undefined, { columns: true });
        span = 2;
      }
      parts.forEach((part, index) => laid.push({
        card: model, part: index + 1, parts: parts.length, fontSize: part.fontSize, html: part.html, span,
      }));
      // Let the page breathe between long cards
      if (parts.length > 1) await new Promise(resolve => setTimeout(resolve));
      if (run !== layoutRun) return;
    }
    cards.value = laid;
  } finally {
    if (run === layoutRun) laying.value = false;
  }
}, { flush: 'post' });

// On the sheets: double cards span two cells; with backs, each sheet is
// followed by its backs, columns mirrored for a flip on the long edge
const sheets = computed(() => packCards(cards.value));
const renderedSheets = computed(() => sheets.value.flatMap(sheet => {
  const front = { back: false, cells: sheet.cells };
  if (!selection.value.backs) return [front];
  const back = {
    back: true,
    cells: sheet.cells.map(cell => ({ ...cell, ...mirrorPlacement(cell) })),
  };
  return [front, back];
}));
const paperSize = computed(() => PAPERS[selection.value.paper]);
const marks = computed(() => cropMarks(selection.value.paper));
const sheetStyle = computed(() => ({
  width: `${paperSize.value.width}mm`,
  height: `${paperSize.value.height}mm`,
}));
const gridStyle = computed(() => {
  const margin = paperMargins(selection.value.paper);
  return { left: `${margin.x}mm`, top: `${margin.y}mm` };
});

// A sheet wider than the screen is scaled down to fit, on screen only
const { width: screenWidth } = useDisplay();
const previewZoom = computed(() => {
  const sheetPx = paperSize.value.width * 96 / 25.4 + 32;
  return screenWidth.value < sheetPx ? { zoom: Math.max(0.3, (screenWidth.value - 16) / sheetPx) } : undefined;
});

// The paper the browser prints on, without margins: the sheets carry their own
const pageStyle = document.createElement('style');
pageStyle.setAttribute('data-print-cards', '');
watchEffect(() => {
  const size = selection.value.paper === 'letter' ? 'letter' : 'A4';
  pageStyle.textContent = `@page { size: ${size} portrait; margin: 0; }`;
});
onMounted(() => document.head.appendChild(pageStyle));
onBeforeUnmount(() => pageStyle.remove());

watchEffect(() => {
  const name = creature.value?.name;
  appStore.setPageTitle(name ? t('pageTitle.printCardsOf', { name }) : t('pageTitle.printCards'));
});
</script>

<style>
.character-cards-printed {
  min-height: 100%;
  background: rgb(var(--v-theme-surface-light, 240, 240, 240));
  padding-bottom: 24px;
}

.cards-choice {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  max-height: 320px;
  overflow-y: auto;
}

.cards-controls__selects {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.card-sheets {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 0 8px;
}

.card-sheet {
  position: relative;
  flex: none;
  background: white;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.card-grid {
  position: absolute;
  display: grid;
  grid-template-columns: repeat(3, 63mm);
  grid-template-rows: repeat(3, 88mm);
}

.crop-marks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.crop-marks line {
  stroke: #000;
  stroke-width: 0.15;
}

/*
 * Invisible but laid out, at print size, never zoomed, and in print too: a
 * layout that runs while the browser prints (the character recomputed) must
 * still measure. A box of no size: it adds no page and no scroll
 */
.cards-measure {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}

.cards-measure .pc {
  contain: strict;
}

@media print {
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
  }
  header,
  nav,
  .v-snackbar,
  .dialog-stack,
  .no-print {
    display: none !important;
  }
  .v-main {
    padding: 0 !important;
  }
  .v-application,
  .v-application__wrap,
  .v-main,
  .character-cards-printed {
    display: block !important;
    min-height: 0 !important;
    height: auto !important;
    background: white !important;
    padding: 0 !important;
  }
  .card-sheets {
    display: block;
    padding: 0;
    zoom: 1 !important;
  }
  .card-sheet {
    box-shadow: none;
    margin: 0;
    break-after: page;
  }
  .card-sheet:last-child {
    break-after: auto;
  }
}
</style>
