<template>
  <!--
    A 63 x 88 mm card, or a double one (126 x 88 mm, its text in two
    columns). The first card of a spell or an item has its header, stats and
    boxes; a continuation card only its name, "continued" and the rest of the
    text; a back, the icon and the name, for a sheet printed on both sides.
    Sizes are in mm and pt: the layout measures these very elements off
    screen, at print size. `lang` is the text's language (its library's), so
    that its words break by its own rules.
  -->
  <article
    v-if="back"
    class="pc pc--back"
    :class="{ 'pc--double': span === 2, 'pc--coloured': !!card.band }"
    :style="colourStyle"
    :data-card="card.kind"
    :data-part="part"
    data-side="back"
    :data-key="`${card.key}-${part}`"
    :lang="card.lang"
  >
    <div class="pc-frame pc-back">
      <svg
        v-if="card.icon"
        class="pc-back-icon"
        viewBox="0 0 512 512"
        aria-hidden="true"
      ><path :d="card.icon" /></svg>
      <div class="pc-back-title">
        {{ card.title }}
      </div>
      <div
        v-if="card.subtitle"
        class="pc-back-subtitle"
      >
        {{ card.subtitle }}
      </div>
      <div
        v-if="parts > 1"
        class="pc-back-part"
      >
        {{ $t('printCards.part', { part, parts }) }}
      </div>
    </div>
  </article>
  <article
    v-else
    class="pc"
    :class="[`pc--${card.kind}`, { 'pc--continued': !first, 'pc--double': span === 2, 'pc--coloured': !!card.band }]"
    :style="colourStyle"
    :data-card="card.kind"
    :data-part="part"
    data-side="front"
    :data-key="`${card.key}-${part}`"
    :lang="card.lang"
  >
    <div class="pc-frame">
      <div class="pc-head">
        <div class="pc-band">
          <div class="pc-title">
            <span class="pc-name">{{ card.title }}</span>
            <span
              v-if="card.quantity"
              class="pc-quantity"
            >{{ card.quantity }}</span>
          </div>
          <svg
            v-if="card.icon"
            class="pc-icon"
            viewBox="0 0 512 512"
            aria-hidden="true"
          ><path :d="card.icon" /></svg>
        </div>
        <template v-if="first">
          <div
            v-if="card.subtitle || card.badges?.length"
            class="pc-subtitle"
          >
            <span>{{ card.subtitle }}</span>
            <span
              v-for="badge in card.badges"
              :key="badge"
              class="pc-badge"
            >{{ badge }}</span>
          </div>
          <dl
            v-if="card.stats?.length"
            class="pc-stats"
            :class="{ 'pc-stats--three': card.stats.length === 3, 'pc-stats--four': span === 2 && card.stats.length === 4 }"
          >
            <div
              v-for="stat in card.stats"
              :key="stat.label"
              class="pc-stat"
            >
              <dt>{{ stat.label }}</dt>
              <dd>{{ stat.value }}</dd>
            </div>
          </dl>
          <div
            v-if="card.lead"
            class="pc-lead"
          >
            {{ card.lead }}
          </div>
        </template>
        <div
          v-else
          class="pc-subtitle"
        >
          {{ $t('printCards.continued') }}
        </div>
      </div>
      <div
        class="pc-body"
        :style="{ fontSize: `${fontSize}pt` }"
      >
        <!-- Sanitised by the page (DOMPurify), as MarkdownText does -->
        <!-- eslint-disable vue/no-v-html -->
        <div
          class="pc-content markdown"
          v-html="html"
        />
        <!-- eslint-enable vue/no-v-html -->
      </div>
      <div
        v-if="first && card.boxes"
        class="pc-boxes"
      >
        <span class="pc-boxes-label">{{ card.boxes.label }}</span>
        <template v-if="card.boxes.count <= 12">
          <span
            v-for="i in card.boxes.count"
            :key="i"
            class="pc-box"
          />
        </template>
        <span v-else>{{ card.boxes.count }}</span>
        <span
          v-if="card.boxes.note"
          class="pc-boxes-note"
        >{{ card.boxes.note }}</span>
      </div>
      <div class="pc-foot">
        <span class="pc-foot-left">{{ card.footerLeft }}</span>
        <span class="pc-foot-right">
          {{ card.footerRight }}<template v-if="parts > 1">
            <template v-if="card.footerRight">
              ·
            </template>
            {{ $t('printCards.part', { part, parts }) }}
          </template>
        </span>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  card: {
    type: Object,
    required: true,
  },
  part: {
    type: Number,
    default: 1,
  },
  parts: {
    type: Number,
    default: 1,
  },
  fontSize: {
    type: Number,
    default: 8,
  },
  html: {
    type: String,
    default: '',
  },
  // 2: a double card, 126 x 88 mm
  span: {
    type: Number,
    default: 1,
  },
  back: Boolean,
});

const first = computed(() => props.part === 1);

// The card's colour (its spell list's or the character's), as the app's
// tonal surfaces give it: tone 40 with white text, a light tint for the back
const colourStyle = computed(() => props.card.band ? {
  '--pc-accent': props.card.band.background,
  '--pc-on-accent': props.card.band.text,
  '--pc-tint': props.card.band.tint,
} : undefined);
</script>

<style>
/* Unscoped: the body's markup comes from v-html, and the layout measures it */
.pc {
  box-sizing: border-box;
  width: 63mm;
  height: 88mm;
  padding: 2mm;
  overflow: hidden;
  background: white;
  color: #111;
  font-family: var(--v-font-body, "Roboto", sans-serif);
  font-size: 7pt;
  line-height: 1.22;
  font-variant-numeric: normal;
  print-color-adjust: exact;
  -webkit-print-color-adjust: exact;
}

.pc {
  /* The cut line, faint: where a guillotine or scissors go */
  outline: 0.1mm solid #d6d6d6;
  outline-offset: -0.05mm;
  --pc-accent: #2b2b2b;
  --pc-on-accent: #111;
  --pc-tint: #f2f2f2;
}

.pc--double {
  width: 126mm;
}

.pc-frame {
  box-sizing: border-box;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 0.3mm solid var(--pc-accent);
  border-radius: 2.2mm;
  padding: 1.6mm 2mm 1.2mm;
  overflow: hidden;
}

.pc-band {
  display: flex;
  align-items: flex-start;
  gap: 1.5mm;
}

/* Coloured: the name on a band of the colour, edge to edge of the frame */
.pc--coloured .pc-band {
  margin: -1.6mm -2mm 0;
  padding: 1.3mm 2mm 1.1mm;
  background: var(--pc-accent);
  color: var(--pc-on-accent);
}

.pc-band .pc-title {
  flex: 1 1 auto;
  min-width: 0;
}

.pc-icon {
  flex: none;
  width: 4.6mm;
  height: 4.6mm;
  fill: currentColor;
  opacity: 0.85;
}

.pc-head {
  flex: none;
}

.pc-title {
  font-family: var(--font-display, Georgia, serif);
  font-weight: 600;
  font-size: 10pt;
  line-height: 1.1;
  /* Two lines at most */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pc--continued .pc-title {
  -webkit-line-clamp: 1;
  font-size: 9pt;
}

.pc-quantity {
  font-family: var(--v-font-body, "Roboto", sans-serif);
  font-weight: 500;
  font-size: 7.5pt;
  margin-left: 1mm;
}

.pc-subtitle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6mm 1.2mm;
  margin-top: 0.6mm;
  font-size: 6.5pt;
  font-style: italic;
  color: #333;
}

.pc-badge {
  font-style: normal;
  font-size: 5.5pt;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border: 0.2mm solid #555;
  border-radius: 1mm;
  padding: 0 0.8mm;
  line-height: 1.5;
}

.pc-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 1.2mm 0 0;
  border-top: 0.2mm solid #888;
  border-bottom: 0.2mm solid #888;
}

.pc-stats--three {
  grid-template-columns: 1fr 1fr 1fr;
}

.pc-stats--four {
  grid-template-columns: 1fr 1fr 1fr 1fr;
}

.pc-stats--four .pc-stat:nth-child(n+3) {
  border-top: none;
}

.pc--coloured .pc-stats {
  border-color: var(--pc-accent);
}

.pc-stat {
  padding: 0.5mm 0.8mm 0.6mm 0;
  min-width: 0;
}

.pc-stat:nth-child(n+3) {
  border-top: 0.15mm solid #ccc;
}

.pc-stats--three .pc-stat:nth-child(n+3) {
  border-top: none;
}

.pc-stat dt {
  font-size: 4.8pt;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #555;
}

.pc-stat dd {
  margin: 0;
  font-size: 6.5pt;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.pc-lead {
  margin-top: 0.8mm;
  font-size: 6pt;
  font-style: italic;
  line-height: 1.15;
  color: #222;
}

.pc-body {
  flex: 1 1 0;
  min-height: 0;
  margin-top: 1.2mm;
  overflow: hidden;
  /* Measured card by card: keep each reflow inside it */
  contain: layout paint;
}

.pc-content {
  hyphens: auto;
  overflow-wrap: break-word;
  text-align: left;
}

.pc-content p,
.pc-content ul,
.pc-content ol,
.pc-content table,
.pc-content blockquote {
  margin: 0 0 0.45em;
}

.pc-content > :last-child {
  margin-bottom: 0;
}

/* A double card's text: two columns, the overflow going to a third */
.pc--double .pc-content {
  height: 100%;
  column-count: 2;
  column-gap: 4mm;
  column-fill: auto;
}

/* The back */
.pc-back {
  align-items: center;
  justify-content: center;
  gap: 2mm;
  text-align: center;
  background: var(--pc-tint);
}

.pc-back-icon {
  width: 24mm;
  height: 24mm;
  fill: var(--pc-accent);
}

.pc-back-title {
  font-family: var(--font-display, Georgia, serif);
  font-weight: 600;
  font-size: 11pt;
  line-height: 1.15;
  padding: 0 3mm;
}

.pc-back-subtitle {
  font-size: 7pt;
  font-style: italic;
  color: #333;
}

.pc-back-part {
  font-size: 6pt;
  color: #444;
}

.pc-content ul,
.pc-content ol {
  padding-left: 1.2em;
}

/* A bullet character: Chromium's disc marker printed half cut off */
.pc-content ul {
  list-style: none;
}

.pc-content ul > li {
  position: relative;
}

.pc-content ul > li::before {
  content: "•";
  position: absolute;
  left: -0.85em;
}

.pc-content ol {
  list-style: decimal outside;
}

.pc-content h1,
.pc-content h2,
.pc-content h3,
.pc-content h4,
.pc-content h5,
.pc-content h6 {
  font-size: 1.05em;
  font-weight: 700;
  margin: 0.3em 0 0.2em;
}

.pc-content table {
  border-collapse: collapse;
  font-size: 0.92em;
  width: 100%;
}

.pc-content th,
.pc-content td {
  border: 0.15mm solid #999;
  padding: 0.2mm 0.6mm;
  vertical-align: top;
}

.pc-content img {
  max-width: 100%;
  max-height: 20mm;
}

.pc-content hr {
  border: none;
  border-top: 0.15mm solid #999;
  margin: 0.4em 0;
}

/* A library's highlights print as plain text */
.pc-content mark,
.pc-content [style*="background"] {
  background: none !important;
  color: inherit !important;
}

.pc-boxes {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.8mm;
  margin-top: 1mm;
  font-size: 5.8pt;
}

.pc-boxes-label {
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 4.8pt;
  color: #555;
  margin-right: 0.5mm;
}

.pc-box {
  display: inline-block;
  width: 2.3mm;
  height: 2.3mm;
  border: 0.2mm solid #333;
  border-radius: 0.4mm;
}

.pc-boxes-note {
  color: #444;
  margin-left: 0.5mm;
}

.pc-foot {
  flex: none;
  display: flex;
  justify-content: space-between;
  gap: 1.5mm;
  margin-top: 0.8mm;
  padding-top: 0.5mm;
  border-top: 0.15mm solid #bbb;
  font-size: 5.3pt;
  color: #333;
  white-space: nowrap;
}

.pc-foot-left {
  overflow: hidden;
  text-overflow: ellipsis;
}

.pc-foot-right {
  flex: none;
}
</style>
