<template>
  <v-container class="documentation">
    <v-row class="justify-center">
      <v-col
        cols="12"
        lg="8"
      >
        <v-card>
          <v-card-text class="text-body-large">
            <h1 class="text-headline-large mt-0 mb-3">
              {{ $t('functions.title') }}
            </h1>
            <div
              v-for="fn in functions"
              :key="fn.name"
              class="mb-3"
            >
              <h3 class="text-title-large mt-0 mb-3">
                {{ fn.name }}
              </h3>
              <div class="my-2">
                {{ fn.comment }}
              </div>
              <v-table density="compact">
                <tbody>
                  <tr
                    v-for="example in fn.examples"
                    :key="example.input"
                  >
                    <td>
                      <v-code>{{ example.input }}</v-code>
                    </td>
                    <td>
                      <v-icon>mdi-arrow-right</v-icon>
                    </td>
                    <td>
                      <v-code>{{ example.result }}</v-code>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import parserFunctions from '/imports/parser/functions';

const functions = computed(() => {
  let fns = [];
  for (let name in parserFunctions) {
    let f = parserFunctions[name];
    fns.push({ name, ...f });
  }
  return fns;
});
</script>
