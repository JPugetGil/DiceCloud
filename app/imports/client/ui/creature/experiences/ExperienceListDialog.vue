<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('xp.experiences') }}
      </v-toolbar-title>
      <v-spacer />
      <v-btn
        variant="text"
        icon
        data-id="experience-add-button"
        @click="addExperience"
      >
        <v-icon>mdi-plus</v-icon>
      </v-btn>
      <v-btn
        variant="text"
        icon
        @click="recompute"
      >
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </template>
    <div
      v-if="!experiencesReady"
      class="d-flex flex-1-1 flex-column align-center justify-center fill-height"
    >
      <v-progress-circular
        indeterminate
        size="240"
      />
    </div>
    <div
      v-else-if="experiences.length === 0"
      class="d-flex flex-1-1 flex-column align-center justify-center fill-height"
    >
      <v-icon class="big-icon">
        $baby_face
      </v-icon>
      <p class="text-h5">
        {{ $t('xp.noExperiences') }}
      </p>
    </div>
    <v-list v-else>
      <v-slide-x-transition
        group
        mode="out"
      >
        <v-list-item
          v-for="experience in experiences"
          :key="experience._id"
          :data-id="experience._id"
        >
          <template #prepend>
            <div class="mr-3">
              <span class="text-caption">
                {{ formatDate(experience.date) }}
              </span>
            </div>
            <v-btn
              variant="text"
              icon
              :loading="experiencesRemovalLoading.has(experience._id)"
              @click="removeExperience(experience._id)"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </template>

          <template v-if="experience.name">
            <v-list-item-title>
              {{ experience.name }}
            </v-list-item-title>
            <v-list-item-subtitle>
              {{ xpText(experience) }}
            </v-list-item-subtitle>
          </template>
          <template v-else>
            <v-list-item-title>
              {{ xpText(experience) }}
            </v-list-item-title>
          </template>
        </v-list-item>
      </v-slide-x-transition>
    </v-list>
  </dialog-base>
</template>

<script setup lang="js">
import { ref } from 'vue';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { format } from 'date-fns';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import Experiences, { removeExperience as removeExperienceMethod, recomputeExperiences } from '/imports/api/creature/experience/Experiences';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
  startAsMilestone: {
    type: Boolean,
  },
});


const experiencesRemovalLoading = ref(new Set());
const recomputeLoading = ref(false);

const { ready: experiencesReady } = subscribe(() => ['experiences', props.creatureId]);

const { result: experiences } = autorun(() => Experiences.find({
  creatureId: props.creatureId
}, {
  sort: {date: 1}
}).fetch());

function xpText(experience){
  let xpText = [];
  if (experience.levels === 1){
    xpText.push(t('xp.oneMilestoneLevel'));
  } else if (experience.levels){
    xpText.push(t('xp.milestoneLevels', { count: experience.levels }));
  }
  if (experience.xp || !experience.levels){
    xpText.push(t('xp.amount', { xp: experience.xp || 0 }));
  }
  return xpText.join(', ');
}

function formatDate(date){
  return format(date, 'YYYY-MM-DD');
}

async function removeExperience(experienceId){
  experiencesRemovalLoading.value.add(experienceId);
  try {
    await removeExperienceMethod.callAsync({experienceId});
  } catch (error) {
    console.error(error);
  } finally {
    experiencesRemovalLoading.value.delete(experienceId);
  }
}

async function recompute(){
  recomputeLoading.value = true;
  try {
    await recomputeExperiences.callAsync({creatureId: props.creatureId});
  } catch (error) {
    console.error(error);
  } finally {
    recomputeLoading.value = false;
  }
}

function addExperience(){
  dialogStackStore.pushDialogStack({
    component: 'experience-insert-dialog',
    elementId: 'experience-add-button',
    data: {
      creatureIds: [props.creatureId],
      startAsMilestone: props.startAsMilestone,
    },
    callback(id){
      return id;
    }
  });
}
</script>

<style lang="css">
.big-icon, .big-icon * {
  width: 240px !important;
  height: 240px !important;
}
</style>
