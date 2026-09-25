<template>
  <v-container class="documentation">
    <v-row justify="center">
      <v-col
        cols="12"
        lg="8"
      >
        <v-card>
          <v-card-text class="markdown">
            <h1>{{ $t('functions.title') }}</h1>
            <div
              v-for="fn in functions"
              :key="fn.name"
              class="mb-3"
            >
              <h3>{{ fn.name }}</h3>
              <div class="my-2">
                {{ fn.comment }}
              </div>
              <table style="min-width: initial;">
                <tr
                  v-for="example in fn.examples"
                  :key="example.input"
                >
                  <td>
                    <code>{{ example.input }}</code>
                  </td>
                  <td>
                    <v-icon>mdi-arrow-right</v-icon>
                  </td>
                  <td>
                    <code>{{ example.result }}</code>
                  </td>
                </tr>
              </table>
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
