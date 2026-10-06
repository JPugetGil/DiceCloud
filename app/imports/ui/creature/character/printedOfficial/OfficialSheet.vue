<template>
  <!--
    The official-looking sheet: the functional structure of a 5e character
    sheet (abilities, saves, skills, armor class, hit points, attacks, spells
    by level, equipment) on a fixed grid, in the app's own dress (Roboto,
    Fraunces titles, the printed sheet's frames) and marked "compatible 5e".
    Three named pages (sheet, spells, equipment), each with a running header
    where the browser draws page-margin boxes (Chrome 131+).
  -->
  <div
    class="official-sheet"
    :class="`official-sheet--${paper}`"
  >
    <section
      class="os-page os-page--sheet"
      data-page="sheet"
    >
      <div class="os-content">
        <div class="os-head double-border">
          <div class="os-name">
            <div class="os-name-value">
              {{ header.name }}
            </div>
            <div class="os-caption">
              {{ $t('officialSheet.characterName') }}
            </div>
          </div>
          <div class="os-head-fields">
            <div
              v-for="field in headerFields"
              :key="field.label"
              class="os-field"
            >
              <div class="os-field-value">
                {{ field.value }}
              </div>
              <div class="os-caption">
                {{ field.label }}
              </div>
            </div>
          </div>
        </div>

        <div class="os-grid">
          <div class="os-col os-col--1">
            <div class="os-col1-top">
              <div class="os-abilities">
                <div
                  v-for="ability in data.abilities.value"
                  :key="ability._id"
                  class="os-ability"
                >
                  <div class="os-ability-frame double-border">
                    <div class="os-caption">
                      {{ ability.name }}
                    </div>
                    <div class="os-ability-mod">
                      {{ signed(ability.modifier) }}
                    </div>
                  </div>
                  <div class="os-ability-score">
                    {{ ability.total ?? ability.value }}
                  </div>
                </div>
              </div>
              <div class="os-col1-right">
                <div class="os-pill">
                  <div class="os-pill-value os-pill-value--box" />
                  <div class="os-pill-label">
                    {{ $t('officialSheet.inspiration') }}
                  </div>
                </div>
                <div class="os-pill">
                  <div class="os-pill-value">
                    {{ signed(data.proficiencyBonus.value?.value) }}
                  </div>
                  <div class="os-pill-label">
                    {{ $t('officialSheet.proficiencyBonus') }}
                  </div>
                </div>
                <div class="os-box">
                  <div
                    v-for="save in data.saves.value"
                    :key="save._id"
                    class="os-line"
                  >
                    <span
                      class="os-prof"
                      :class="`os-prof--${proficiencyMark(save.proficiency)}`"
                    />
                    <span class="os-line-value">{{ signed(save.value) }}</span>
                    <span class="os-line-name">{{ abilityName?.[save.ability] || save.name }}</span>
                  </div>
                  <div class="os-caption os-box-caption">
                    {{ $t('officialSheet.savingThrows') }}
                  </div>
                </div>
                <div class="os-box os-skills">
                  <div
                    v-for="skill in sortedSkills"
                    :key="skill._id"
                    class="os-line"
                  >
                    <span
                      class="os-prof"
                      :class="`os-prof--${proficiencyMark(skill.proficiency)}`"
                    />
                    <span class="os-line-value">{{ signed(skill.value) }}</span>
                    <span class="os-line-name">{{ skill.name }}</span>
                    <span
                      v-if="abilityShort(skill.ability)"
                      class="os-line-ability"
                    >{{ abilityShort(skill.ability) }}</span>
                  </div>
                  <div class="os-caption os-box-caption">
                    {{ $t('officialSheet.skills') }}
                  </div>
                </div>
              </div>
            </div>
            <div class="os-pill os-passive">
              <div class="os-pill-value">
                {{ passivePerception }}
              </div>
              <div class="os-pill-label">
                {{ $t('officialSheet.passivePerception') }}
              </div>
            </div>
            <div class="os-box os-profs">
              <div
                v-for="row in proficiencyRows"
                :key="row.label"
                class="os-prof-row"
              >
                <b>{{ row.label }}{{ colon }}</b> {{ row.value }}
              </div>
              <div class="os-caption os-box-caption">
                {{ $t('officialSheet.proficiencies') }}
              </div>
            </div>
          </div>

          <div class="os-col os-col--2">
            <div class="os-trio">
              <div class="os-stat os-stat--shield">
                <div class="os-stat-value">
                  {{ data.armor.value?.value ?? '' }}
                </div>
                <div class="os-caption">
                  {{ $t('officialSheet.armorClass') }}
                </div>
              </div>
              <div class="os-stat octagon-border">
                <div class="os-stat-value">
                  {{ signed(data.initiative.value?.value) }}
                </div>
                <div class="os-caption">
                  {{ $t('officialSheet.initiative') }}
                </div>
              </div>
              <div class="os-stat octagon-border">
                <div class="os-stat-value os-stat-value--small">
                  {{ speedText }}
                </div>
                <div class="os-caption">
                  {{ $t('officialSheet.speed') }}
                </div>
              </div>
            </div>
            <div class="os-box os-hp">
              <div class="os-hp-max">
                <span class="os-caption">{{ $t('officialSheet.hitPointMax') }}</span>
                <span class="os-hp-max-value">{{ data.hitPoints.value?.total ?? '' }}</span>
              </div>
              <div class="os-hp-blank" />
              <div class="os-caption os-box-caption">
                {{ $t('officialSheet.currentHitPoints') }}
              </div>
            </div>
            <div class="os-box os-hp os-hp--temp">
              <div class="os-hp-blank" />
              <div class="os-caption os-box-caption">
                {{ $t('officialSheet.temporaryHitPoints') }}
              </div>
            </div>
            <div class="os-duo">
              <div class="os-box">
                <div class="os-hd">
                  <span class="os-caption">{{ $t('officialSheet.hitDice') }}</span>
                  <span>{{ hitDiceText }}</span>
                </div>
                <div class="os-hp-blank os-hp-blank--short" />
                <div class="os-caption os-box-caption">
                  {{ $t('officialSheet.hitDice') }}
                </div>
              </div>
              <div class="os-box">
                <div class="os-death">
                  <span class="os-caption">{{ $t('officialSheet.successes') }}</span>
                  <span
                    v-for="i in 3"
                    :key="`s${i}`"
                    class="os-circle"
                  />
                </div>
                <div class="os-death">
                  <span class="os-caption">{{ $t('officialSheet.failures') }}</span>
                  <span
                    v-for="i in 3"
                    :key="`f${i}`"
                    class="os-circle"
                  />
                </div>
                <div class="os-caption os-box-caption">
                  {{ $t('officialSheet.deathSaves') }}
                </div>
              </div>
            </div>
            <div class="os-box os-attacks">
              <table>
                <thead>
                  <tr>
                    <th>{{ $t('officialSheet.attackName') }}</th>
                    <th>{{ $t('officialSheet.attackBonus') }}</th>
                    <th>{{ $t('officialSheet.attackDamage') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="attack in attackRows"
                    :key="attack.key"
                  >
                    <td>{{ attack.name }}</td>
                    <td>{{ attack.bonus }}</td>
                    <td>{{ attack.damage }}</td>
                  </tr>
                </tbody>
              </table>
              <div class="os-caption os-box-caption">
                {{ $t('officialSheet.attacks') }}
              </div>
            </div>
            <div
              v-if="data.resources.value.length"
              class="os-box os-resources"
            >
              <div
                v-for="resource in data.resources.value.slice(0, 4)"
                :key="resource._id"
                class="os-resource"
              >
                <span class="os-resource-name">{{ resource.name }}</span>
                <template v-if="resource.total <= 12">
                  <span
                    v-for="i in resource.total"
                    :key="i"
                    class="os-circle"
                  />
                </template>
                <span v-else>{{ resource.value }} / {{ resource.total }}</span>
              </div>
              <div class="os-caption os-box-caption">
                {{ $t('officialSheet.resources') }}
              </div>
            </div>
            <div class="os-box os-gear">
              <div class="os-gear-coins">
                <span
                  v-for="coin in data.coins.value"
                  :key="coin.tag"
                  class="os-gear-coin"
                ><b>{{ coin.quantity }}</b>&#8202;{{ coinLabel(coin.tag) }}</span>
              </div>
              <div class="os-gear-list">
                {{ inventoryRows.map(item => item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name).join(', ') }}
              </div>
              <div class="os-caption os-box-caption">
                {{ $t('officialSheet.equipment') }}
              </div>
            </div>
          </div>

          <div class="os-col os-col--3">
            <div class="os-box os-features">
              <div class="os-features-list">
                <div
                  v-for="feature in data.features.value"
                  :key="feature._id"
                  class="os-feature"
                >
                  <b>{{ feature.name }}.</b> {{ plain(feature.summary) }}
                </div>
              </div>
              <div class="os-caption os-box-caption">
                {{ $t('officialSheet.featuresTraits') }}
              </div>
            </div>
          </div>
        </div>
        <div class="os-foot">
          {{ $t('officialSheet.compatible') }} · DiceCloud
        </div>
      </div>
    </section>

    <section
      class="os-page os-page--spells"
      data-page="spells"
    >
      <div class="os-content">
        <div class="os-page-title">
          {{ $t('officialSheet.spellcasting') }}
        </div>
        <div
          v-for="list in castingLists"
          :key="list._id"
          class="os-casting double-border"
        >
          <div class="os-field">
            <div class="os-field-value">
              {{ list.name }}
            </div>
            <div class="os-caption">
              {{ $t('officialSheet.spellcastingClass') }}
            </div>
          </div>
          <div class="os-field">
            <div class="os-field-value">
              {{ list.abilityName }}
            </div>
            <div class="os-caption">
              {{ $t('officialSheet.spellcastingAbility') }}
            </div>
          </div>
          <div class="os-field">
            <div class="os-field-value">
              {{ list.dc?.value ?? '' }}
            </div>
            <div class="os-caption">
              {{ $t('officialSheet.spellSaveDc') }}
            </div>
          </div>
          <div class="os-field">
            <div class="os-field-value">
              {{ signed(list.attackRollBonus?.value) }}
            </div>
            <div class="os-caption">
              {{ $t('officialSheet.spellAttackBonus') }}
            </div>
          </div>
        </div>
        <div class="os-spell-levels">
          <div
            v-for="block in spellLevels"
            :key="block.level"
            class="os-spell-level os-box"
          >
            <div class="os-spell-level-head">
              <span class="os-spell-level-name">{{ block.level ? $t('officialSheet.spellLevel', { level: block.level }) : $t('officialSheet.cantrips') }}</span>
              <span
                v-if="block.slots"
                class="os-slots"
              >
                <span class="os-caption">{{ $t('officialSheet.slots') }}</span>
                <span
                  v-for="i in block.slots"
                  :key="i"
                  class="os-circle"
                />
              </span>
            </div>
            <div
              v-for="spell in block.spells"
              :key="spell._id"
              class="os-spell"
            >
              <span class="os-spell-mark">{{ spell.alwaysPrepared ? '◆' : spell.prepared ? '●' : block.level ? '○' : '' }}</span>
              <span class="os-spell-name">{{ spell.name }}<span
                v-if="spellSource(spell)"
                class="os-spell-source"
              > ({{ spellSource(spell) }})</span></span>
              <span class="os-spell-tags">{{ [spell.concentration && 'C', spell.ritual && 'R'].filter(Boolean).join(' ') }}</span>
            </div>
            <div
              v-for="i in blankLines(block)"
              :key="`blank${i}`"
              class="os-spell os-spell--blank"
            />
          </div>
          <div
            v-if="!spellLevels.length"
            class="os-empty"
          >
            {{ $t('officialSheet.noSpells') }}
          </div>
        </div>
        <div class="os-legend">
          {{ $t('officialSheet.preparedLegend') }}
        </div>
        <div class="os-foot">
          {{ $t('officialSheet.compatible') }} · DiceCloud
        </div>
      </div>
    </section>

    <section
      class="os-page os-page--inventory"
      data-page="inventory"
    >
      <div class="os-content">
        <div class="os-page-title">
          {{ $t('officialSheet.equipment') }}
        </div>
        <div class="os-coins">
          <div
            v-for="coin in data.coins.value"
            :key="coin.tag"
            class="os-coin octagon-border"
          >
            <div class="os-stat-value os-stat-value--small">
              {{ coin.quantity }}
            </div>
            <div class="os-caption">
              {{ coinLabel(coin.tag) }}
            </div>
          </div>
          <div class="os-field os-carried">
            <div class="os-field-value">
              {{ weightCarried }}
            </div>
            <div class="os-caption">
              {{ $t('officialSheet.weightCarried') }}
            </div>
          </div>
        </div>
        <table class="os-inventory">
          <thead>
            <tr>
              <th>{{ $t('officialSheet.itemName') }}</th>
              <th>{{ $t('officialSheet.quantity') }}</th>
              <th>{{ $t('officialSheet.weight') }}</th>
              <th>{{ $t('officialSheet.value') }}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in inventoryRows"
              :key="item._id"
            >
              <td>{{ item.name }}</td>
              <td>{{ item.quantity }}</td>
              <td>{{ item.weight }}</td>
              <td>{{ item.value }}</td>
              <td>{{ item.state }}</td>
            </tr>
          </tbody>
        </table>
        <div
          v-if="!inventoryRows.length"
          class="os-empty"
        >
          {{ $t('officialSheet.noEquipment') }}
        </div>
        <div class="os-box os-notes">
          <div
            v-for="i in 40"
            :key="i"
            class="os-note-line"
          />
          <div class="os-caption os-box-caption">
            {{ $t('officialSheet.notes') }}
          </div>
        </div>
        <div class="os-foot">
          {{ $t('officialSheet.compatible') }} · DiceCloud
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { autorun } from 'vue-meteor-tracker';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import useUnits from '/imports/ui/composables/useUnits';
import { getAttributeUnit } from '/imports/api/utility/units';
import { damageTypeName } from '/imports/ui/i18n';
import useOfficialSheet from './useOfficialSheet';
import { pageRules, proficiencyMark, spellsByLevel, signed, damageText } from './officialLogic';

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
  // name, classes, race, background, alignment, level, gender
  header: {
    type: Object,
    required: true,
  },
  paper: {
    type: String,
    default: 'a4',
  },
});

const { t, locale } = useI18n();
const { formatQuantity } = useUnits();
const data = useOfficialSheet(computed(() => props.creatureId));

// The colon of a label, by the language's typography ("Armes : ...")
const colon = computed(() => locale.value.startsWith('fr') ? '\u00a0:' : ':');

const headerFields = computed(() => [
  { label: t('officialSheet.classLevel'), value: props.header.classes },
  { label: t('officialSheet.background'), value: props.header.background },
  { label: t('officialSheet.race'), value: props.header.race },
  { label: t('officialSheet.alignment'), value: props.header.alignment },
  { label: t('officialSheet.level'), value: props.header.level },
  { label: t('officialSheet.gender'), value: props.header.gender },
]);

const sortedSkills = computed(() => [...data.skills.value]
  .sort((a, b) => (a.name || '').localeCompare(b.name || '', locale.value)));

// Each ability's short name for the skills, as the sheet's own abilities say it
const abilityShort = variableName => {
  const ability = data.abilities.value.find(a => a.variableName === variableName);
  return ability?.name ? ability.name.slice(0, 3) : '';
};

const passivePerception = computed(() => {
  const perception = data.perception.value;
  if (!perception) return '';
  return 10 + (perception.value || 0) + (perception.passiveBonus || 0);
});

const speedText = computed(() => {
  const speed = data.speed.value;
  if (!speed) return '';
  return formatQuantity(speed.value, getAttributeUnit(speed) || 'distance');
});

const hitDiceText = computed(() => data.hitDice.value
  .map(dice => `${dice.total ?? ''}${dice.hitDiceSize || ''}`).filter(Boolean).join(', '));

const attackRows = computed(() => {
  const rows = data.attacks.value.slice(0, 9).map(attack => ({
    key: attack._id,
    name: attack.name,
    bonus: signed(attack.bonus),
    damage: damageText(attack.damages, damageTypeName),
  }));
  // Blank lines to write in, up to nine
  while (rows.length < 6) rows.push({ key: `blank${rows.length}`, name: '', bonus: '', damage: '' });
  return rows;
});

const plain = field => {
  const text = typeof field?.value === 'string' ? field.value : field?.text;
  return (text || '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
};

const proficiencyRows = computed(() => [
  { label: t('officialSheet.armor'), value: data.armorProficiencies.value.join(', ') },
  { label: t('officialSheet.weapons'), value: data.weaponProficiencies.value.join(', ') },
  { label: t('officialSheet.tools'), value: data.toolProficiencies.value.join(', ') },
  { label: t('officialSheet.languages'), value: data.languages.value.join(', ') },
  data.darkvision.value?.value && {
    label: t('officialSheet.senses'),
    value: `${data.darkvision.value.name} ${formatQuantity(data.darkvision.value.value, 'distance')}`,
  },
].filter(row => row && row.value));

// The spell lists that cast: an ability, a DC or an attack bonus
const abilityName = autorun(() => {
  const names = {};
  CreatureProperties.find({ 'root.id': props.creatureId, type: 'attribute', attributeType: 'ability', removed: { $ne: true } },
    { fields: { variableName: 1, name: 1 } }).forEach(a => { names[a.variableName] = a.name; });
  return names;
}).result;
// The lists that cast (an ability, a DC), the fullest first; one per set of
// figures: a race's list and a class's often share them
const inside = (doc, ancestor) => ancestor.left < doc.left && ancestor.right > doc.right;
const spellCount = list => data.spells.value.filter(spell => inside(spell, list)).length;
const castingLists = computed(() => data.spellLists.value
  .filter(list => list.ability || Number.isFinite(list.dc?.value))
  .sort((a, b) => spellCount(b) - spellCount(a))
  .filter((list, index, lists) => lists.findIndex(other => other.dc?.value === list.dc?.value
    && other.ability === list.ability && other.attackRollBonus?.value === list.attackRollBonus?.value) === index)
  .map(list => ({ ...list, abilityName: abilityName.value?.[list.ability] || list.ability || '' })));

// A spell from elsewhere than the lists above (a wand's) says where from
const spellSource = spell => {
  const list = data.spellLists.value.filter(l => inside(spell, l)).sort((a, b) => b.left - a.left)[0];
  return list && !castingLists.value.some(cast => cast._id === list._id) ? list.name : '';
};

const spellLevels = computed(() => spellsByLevel(data.spells.value, data.spellSlots.value, locale.value));
// Lines to write in: a few more under each level, as on a paper sheet
const blankLines = block => Math.max(block.level ? 3 : 2, (block.level ? 7 : 6) - block.spells.length);

const numberFormat = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }));
const inventoryRows = computed(() => [...data.items.value]
  .sort((a, b) => Number(!!b.equipped) - Number(!!a.equipped))
  .map(item => ({
    _id: item._id,
    name: (item.quantity > 1 && item.plural) || item.name,
    quantity: item.quantity ?? 1,
    weight: Number.isFinite(item.weight) && item.weight ? formatQuantity(item.weight, 'weight') : '',
    value: Number.isFinite(item.value) && item.value ? t('printCards.gp', { value: numberFormat.value.format(item.value) }) : '',
    state: [item.equipped && t('officialSheet.equipped'), item.attuned && t('attunement.attuned')].filter(Boolean).join(', '),
  })));

const weightCarried = computed(() => {
  const weight = data.variables.value?.weightCarried?.value;
  return Number.isFinite(weight) ? formatQuantity(weight, 'weight') : '';
});

const COIN_CODES = { en: { platinum: 'pp', gold: 'gp', electrum: 'ep', silver: 'sp', copper: 'cp' },
  fr: { platinum: 'pp', gold: 'po', electrum: 'pe', silver: 'pa', copper: 'pc' } };
const coinLabel = tag => (COIN_CODES[locale.value.slice(0, 2)] || COIN_CODES.en)[tag];

// The named pages, their paper and running headers
const pageStyle = document.createElement('style');
pageStyle.setAttribute('data-official-sheet', '');
watchEffect(() => {
  const name = props.header.name || '';
  const title = [name, props.header.classes].filter(Boolean).join(' — ');
  pageStyle.textContent = `${pageRules({
    paper: props.paper,
    headerRight: t('officialSheet.compatibleShort'),
    footer: t('officialSheet.page'),
    pages: [
      { name: 'os-sheet', title },
      { name: 'os-spells', title: t('officialSheet.spellsPage', { name }) },
      { name: 'os-inventory', title: t('officialSheet.inventoryPage', { name }) },
    ],
  })}
@media print { body { padding: 0 !important; margin: 0 !important; } }`;
});
onMounted(() => document.head.appendChild(pageStyle));
onBeforeUnmount(() => pageStyle.remove());
</script>

<style>
.official-sheet {
  color: #111;
  font-family: var(--v-font-body, "Roboto", sans-serif);
  font-size: 7.5pt;
  line-height: 1.25;
}

.official-sheet .os-page {
  box-sizing: border-box;
  background: white;
}

.official-sheet .os-page--sheet { page: os-sheet; }
.official-sheet .os-page--spells { page: os-spells; }
.official-sheet .os-page--inventory { page: os-inventory; }

/* The fixed grid: 186 x 250 mm on A4 and Letter alike */
.official-sheet .os-content {
  position: relative;
  width: 186mm;
  height: 250mm;
  display: flex;
  flex-direction: column;
  gap: 2mm;
  overflow: hidden;
}

.official-sheet .os-caption {
  font-size: 5.5pt;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #333;
}

.official-sheet .os-head {
  display: flex;
  gap: 4mm;
  align-items: stretch;
  flex: none;
  min-height: 20mm;
}

.official-sheet .os-name {
  flex: 0 0 62mm;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  border-bottom: 0.3mm solid #222;
  padding-bottom: 0.5mm;
}

.official-sheet .os-name-value {
  font-family: var(--font-display, Georgia, serif);
  font-weight: 600;
  font-size: 15pt;
  line-height: 1.1;
}

.official-sheet .os-head-fields {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5mm 3mm;
}

.official-sheet .os-field {
  border-bottom: 0.2mm solid #555;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  min-width: 0;
}

.official-sheet .os-field-value {
  min-height: 1.25em;
  font-size: 8.5pt;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.official-sheet .os-grid {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 62mm 60mm 58mm;
  column-gap: 3mm;
}

.official-sheet .os-col {
  display: flex;
  flex-direction: column;
  gap: 2mm;
  min-height: 0;
}

.official-sheet .os-col1-top {
  display: flex;
  gap: 2mm;
  flex: 1 1 auto;
  min-height: 0;
}

.official-sheet .os-abilities {
  flex: 0 0 21mm;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
}

.official-sheet .os-ability {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.official-sheet .os-ability-frame {
  width: 21mm;
  box-sizing: border-box;
  text-align: center;
  padding: 1.5mm 0 4mm;
}

.official-sheet .os-ability-mod {
  font-size: 18pt;
  line-height: 1.15;
}

.official-sheet .os-ability-score {
  margin-top: -2.4mm;
  position: relative;
  min-width: 9mm;
  padding: 0 3mm;
  text-align: center;
  font-size: 8pt;
  background: white;
  border: solid white;
  border-image-source: url(/images/print/upwardPointingBorder.png);
  border-image-slice: 0 85 fill;
  border-image-width: 0 3mm;
  border-image-repeat: stretch;
}

.official-sheet .os-col1-right {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2mm;
}

.official-sheet .os-pill {
  display: flex;
  align-items: center;
  gap: 1.5mm;
  border: 0.25mm solid #222;
  border-radius: 3mm;
  padding: 0.6mm 2mm 0.6mm 0.6mm;
}

.official-sheet .os-pill-value {
  flex: none;
  min-width: 8mm;
  height: 6mm;
  border: 0.25mm solid #222;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9pt;
}

.official-sheet .os-pill-value--box {
  border-radius: 1mm;
  min-width: 6mm;
}

.official-sheet .os-pill-label {
  font-size: 6pt;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  line-height: 1.1;
}

.official-sheet .os-passive {
  flex: none;
}

.official-sheet .os-box {
  position: relative;
  border: 0.25mm solid #222;
  border-radius: 1.5mm;
  padding: 1.2mm 1.6mm 4mm;
  min-height: 0;
}

.official-sheet .os-box-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0.8mm;
  text-align: center;
}

.official-sheet .os-skills {
  flex: none;
}

.official-sheet .os-line {
  display: flex;
  align-items: center;
  gap: 1mm;
  font-size: 7pt;
  line-height: 1.32;
  white-space: nowrap;
}

.official-sheet .os-line-value {
  flex: none;
  min-width: 4.5mm;
  text-align: right;
  border-bottom: 0.15mm solid #777;
}

.official-sheet .os-line-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.official-sheet .os-line-ability {
  margin-left: auto;
  color: #666;
  font-size: 5.5pt;
}

.official-sheet .os-prof {
  flex: none;
  width: 2mm;
  height: 2mm;
  border-radius: 50%;
  border: 0.2mm solid #222;
  box-sizing: border-box;
}

.official-sheet .os-prof--proficient { background: #222; }
.official-sheet .os-prof--half { background: linear-gradient(90deg, #222 50%, white 50%); }
.official-sheet .os-prof--expertise { background: #222; box-shadow: 0 0 0 0.4mm white, 0 0 0 0.6mm #222; }

.official-sheet .os-trio {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5mm;
}

.official-sheet .os-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 15mm;
  text-align: center;
}

.official-sheet .os-stat.octagon-border {
  padding: 1mm 2mm;
  border-image-width: 4mm;
}

.official-sheet .os-stat--shield {
  background: url(/images/print/shieldBorder.png) center 0 / auto 12.5mm no-repeat;
  justify-content: flex-start;
  padding-top: 2.6mm;
}

.official-sheet .os-stat--shield .os-stat-value {
  height: 9.6mm;
}

.official-sheet .os-stat-value {
  font-size: 15pt;
  line-height: 1.1;
}

.official-sheet .os-stat-value--small {
  font-size: 10pt;
}

.official-sheet .os-hp {
  min-height: 17mm;
}

.official-sheet .os-hp--temp {
  min-height: 12mm;
}

.official-sheet .os-hp-max {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 0.15mm solid #777;
}

.official-sheet .os-hp-max-value {
  font-size: 10pt;
}

.official-sheet .os-hp-blank {
  height: 6mm;
}

.official-sheet .os-hp-blank--short {
  height: 3mm;
}

.official-sheet .os-duo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5mm;
}

.official-sheet .os-hd {
  display: flex;
  justify-content: space-between;
  gap: 1mm;
  border-bottom: 0.15mm solid #777;
}

.official-sheet .os-death {
  display: flex;
  align-items: center;
  gap: 0.8mm;
}

.official-sheet .os-death .os-caption {
  flex: 1 1 auto;
}

.official-sheet .os-circle {
  display: inline-block;
  flex: none;
  width: 2.6mm;
  height: 2.6mm;
  border: 0.2mm solid #222;
  border-radius: 50%;
  box-sizing: border-box;
}

.official-sheet .os-attacks {
  flex: none;
}

.official-sheet .os-gear {
  flex: 1 1 auto;
  font-size: 6.5pt;
  overflow: hidden;
}

.official-sheet .os-gear-coins {
  display: flex;
  justify-content: space-between;
  border-bottom: 0.15mm solid #777;
  margin-bottom: 1mm;
  padding-bottom: 0.5mm;
  font-size: 7pt;
}

.official-sheet .os-gear-coin b {
  font-weight: 500;
  font-size: 8.5pt;
}

.official-sheet .os-notes {
  flex: 1 1 auto;
  margin-top: 3mm;
  overflow: hidden;
}

.official-sheet .os-note-line {
  height: 6.5mm;
  border-bottom: 0.15mm solid #bbb;
}

.official-sheet .os-attacks table,
.official-sheet .os-inventory {
  width: 100%;
  border-collapse: collapse;
  font-size: 7pt;
}

.official-sheet .os-attacks th,
.official-sheet .os-inventory th {
  font-size: 5.5pt;
  font-weight: 600;
  text-transform: uppercase;
  text-align: left;
  color: #333;
  padding: 0 0.8mm 0.5mm;
}

.official-sheet .os-attacks td,
.official-sheet .os-inventory td {
  border-bottom: 0.15mm solid #999;
  padding: 0.6mm 0.8mm;
  height: 3.6mm;
  vertical-align: bottom;
}

.official-sheet .os-attacks td:nth-child(2) {
  width: 9mm;
  text-align: center;
}

.official-sheet .os-resource {
  display: flex;
  align-items: center;
  gap: 0.8mm;
  flex-wrap: wrap;
}

.official-sheet .os-resource-name {
  flex: 1 1 100%;
  font-size: 6.5pt;
}

.official-sheet .os-features {
  flex: 1 1 auto;
  overflow: hidden;
}

.official-sheet .os-features-list {
  font-size: 6.5pt;
  line-height: 1.25;
  max-height: 100%;
  overflow: hidden;
}

.official-sheet .os-feature {
  margin-bottom: 0.8mm;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  hyphens: auto;
}

.official-sheet .os-profs {
  flex: 1 1 auto;
  font-size: 6.5pt;
  overflow: hidden;
}

.official-sheet .os-prof-row {
  margin-bottom: 0.6mm;
}

.official-sheet .os-foot {
  flex: none;
  text-align: right;
  font-size: 5.5pt;
  color: #555;
}

.official-sheet .os-page-title {
  font-family: var(--font-display, Georgia, serif);
  font-weight: 600;
  font-size: 14pt;
}

.official-sheet .os-casting {
  display: grid;
  grid-template-columns: 2fr 1.4fr 1fr 1fr;
  gap: 3mm;
  flex: none;
}

.official-sheet .os-spell-levels {
  flex: 1 1 auto;
  min-height: 0;
  column-count: 3;
  column-gap: 3mm;
}

.official-sheet .os-spell-level {
  break-inside: avoid;
  margin-bottom: 2mm;
  padding-bottom: 1.4mm;
}

.official-sheet .os-spell-level-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 0.25mm solid #222;
  margin-bottom: 0.8mm;
  padding-bottom: 0.4mm;
}

.official-sheet .os-spell-level-name {
  font-family: var(--font-display, Georgia, serif);
  font-weight: 600;
  font-size: 9pt;
}

.official-sheet .os-slots {
  display: flex;
  align-items: center;
  gap: 0.6mm;
}

.official-sheet .os-spell {
  display: flex;
  gap: 1mm;
  font-size: 7.5pt;
  line-height: 1.4;
  border-bottom: 0.15mm solid #bbb;
}

.official-sheet .os-spell-mark {
  flex: none;
  width: 2.6mm;
  text-align: center;
}

.official-sheet .os-spell--blank {
  height: 1.4em;
}

.official-sheet .os-spell-source {
  color: #666;
  font-size: 6pt;
}

.official-sheet .os-spell-tags {
  margin-left: auto;
  color: #555;
  font-size: 6pt;
}

.official-sheet .os-legend {
  flex: none;
  font-size: 6pt;
  color: #444;
}

.official-sheet .os-coins {
  display: flex;
  gap: 2mm;
  align-items: stretch;
  flex: none;
}

.official-sheet .os-coin {
  flex: 0 0 17mm;
  text-align: center;
  padding: 1mm 2mm;
  border-image-width: 4mm;
}

.official-sheet .os-carried {
  flex: 1 1 auto;
  margin-left: 4mm;
}

.official-sheet .os-inventory td:nth-child(2),
.official-sheet .os-inventory td:nth-child(3),
.official-sheet .os-inventory td:nth-child(4) {
  white-space: nowrap;
}

.official-sheet .os-empty {
  color: #555;
  font-style: italic;
}

@media screen {
  .official-sheet {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .official-sheet .os-page {
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
    padding: 16mm 12mm 31mm;
  }
  .official-sheet--letter .os-page {
    padding: 16mm 14.95mm 13.4mm;
  }
}

@media print {
  .official-sheet .os-page {
    break-after: page;
  }
  .official-sheet .os-page:last-child {
    break-after: auto;
  }
}
</style>
