<template>
  <div
    class="layout justify-center card-background"
    style="height: 100%;"
  >
    <v-card
      class="ma-4 pa-2"
      style="flex-basis: 900px"
    >
      <v-list>
        <v-subheader class="mb-4">
          Preferences
        </v-subheader>
        <v-list-item>
          <smart-toggle
            label="Theme"
            :value="darkMode === true ? 'true' : darkMode === false ? 'false' : darkMode === null ? 'unset': undefined"
            :options="[
              {name: 'Dark', value: 'true', icon: 'mdi-brightness-5'},
              {name: 'Match device theme', value: 'unset'},
              {name: 'Light', value: 'false', icon: 'mdi-brightness-7'},
            ]"
            @change="setDarkMode"
          />
        </v-list-item>
        <v-list-item>
          <smart-switch
            label="Swap ability scores and modifiers"
            :value="
              user &&
                user.preferences &&
                user.preferences.swapAbilityScoresAndModifiers
            "
            @change="swapAbilityScoresAndModifiers"
          />
        </v-list-item>

        <v-subheader>
          Username
        </v-subheader>
        <v-list-item data-id="username">
          <v-list-item-action>
            <v-tooltip right>
              <template #activator="{ on }">
                <v-btn
                  icon
                  v-on="on"
                  @click="changeUsername"
                >
                  <v-icon>mdi-pencil</v-icon>
                </v-btn>
              </template>
              <span>Change Username</span>
            </v-tooltip>
          </v-list-item-action>
          <v-list-item-title>
            {{ user && user.username }}
          </v-list-item-title>
        </v-list-item>

        <v-subheader>
          Email
        </v-subheader>
        <v-list-item
          v-for="email in emails"
          :key="email.address"
        >
          <v-list-item-action v-if="emails.length > 1">
            <v-btn
              icon
              small
              @click="removeEmail(email.address)"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </v-list-item-action>
          <v-list-item-title>
            {{ email.address }}
          </v-list-item-title>
        </v-list-item>
        <v-expand-transition>
          <v-alert
            v-if="removeEmailError"
            type="error"
          >
            {{ removeEmailError }}
          </v-alert>
        </v-expand-transition>
        <v-slide-x-transition
          hide-on-leave
        >
          <v-text-field
            v-if="showEmailInput"
            v-model="inputEmail"
            label="Add Email Address"
            :error-messages="addEmailError"
            outlined
          >
            <v-btn
              slot="prepend"
              icon
              @click="clearEmailInput"
            >
              <v-icon>mdi-close</v-icon>
            </v-btn>
            <v-btn
              slot="append"
              icon
              @click="addEmail"
            >
              <v-icon>mdi-send</v-icon>
            </v-btn>
          </v-text-field>
          <v-btn
            v-else-if="!emails || emails.length < 2"
            icon
            @click="showEmailInput = true"
          >
            <v-icon>mdi-plus</v-icon>
          </v-btn>
        </v-slide-x-transition>
        <v-list-item v-if="!user.services.google">
          <v-btn
            color="primary"
            @click="linkWithGoogle"
          >
            Link Google Account
          </v-btn>
        </v-list-item>
      </v-list>
      <v-layout
        justify-end
      >
        <v-btn
          color="accent"
          @click="signOut"
        >
          Sign Out
        </v-btn>
      </v-layout>
      <v-layout
        justify-end
        class="mt-3"
      >
        <v-btn
          color="error"
          data-id="delete-account-btn"
          @click="deleteAccount"
        >
          Delete Account
        </v-btn>
      </v-layout>
    </v-card>
  </div>
</template>

<script lang="js">
  import router from '/imports/client/ui/router';
  import addEmail from '/imports/api/users/methods/addEmail';
  import removeEmail from '/imports/api/users/methods/removeEmail';

  export default {
    meteor: {
      user(){
        return Meteor.user();
      },
      googleAccount(){
        const user = Meteor.user();
        return user && user.services && user.services.google;
      },
      emails(){
        const user = Meteor.user();
        return user && user.emails;
      },
      darkMode(){
        return this.user && this.user.darkMode;
      },
    },
    data(){ return {
      showApiKey: false,
      signOutBusy: false,
      apiKeyGenerationError: null,
      emailVerificationError: null,
      linkGoogleError: '',
      // Add email
      showEmailInput: false,
      addEmailLoading: false,
      inputEmail: '',
      addEmailError: undefined,
      // Remove email
      removeEmailLoading: undefined,
      removeEmailError: undefined,
    }},
    methods: {
      changeUsername(){
        this.$store.commit('pushDialogStack', {
          component: 'username-dialog',
          elementId: 'username',
        });
      },
      clearEmailInput(){
        this.showEmailInput = false;
        this.addEmailError = undefined;
        this.inputEmail = '';
      },
      addEmail(){
        this.addEmailLoading = true;
        addEmail.call({email: this.inputEmail}, error => {
          this.addEmailError = error && error.message;
          this.addEmailLoading = false;
          if (!error){
            this.showEmailInput = false;
            this.inputEmail = '';
          }
        });
      },
      removeEmail(address){
        this.removeEmailLoading = address;
        removeEmail.call({email: address}, error => {
          this.removeEmailError = error && error.message;
          this.removeEmailLoading = undefined;
          if (!error){
            this.showEmailInput = false;
            this.inputEmail = '';
          }
        });
      },
      signOut(){
        Meteor.logout();
        router.push('/');
      },
      setDarkMode(value, ack) {
        let darkMode;
        if (value === 'true') {
          darkMode = true;
        } else if (value === 'false') {
          darkMode = false;
        } else if (value === 'unset') {
          darkMode = null;
        }
        Meteor.users.setDarkMode.call({darkMode}, ack);
      },
      swapAbilityScoresAndModifiers(value, ack){
        Meteor.users.setPreference.call({
          preference: 'swapAbilityScoresAndModifiers',
          value: !!value,
        }, ack);
      },
      generateKey(){
        Meteor.users.gnerateApiKey.call(error => {
          if(error) this.apiKeyGenerationError = error.reason;
        });
        this.showApiKey = true;
      },
      verifyEmail(address){
        Meteor.users.sendVerificationEmail.call({address}, error => {
          if(error) this.emailVerificationError = error.reason;
        });
      },
      linkWithGoogle(){
        this.linkGoogleError = '';
        Meteor.linkWithGoogle(error => {
          if (error) this.linkGoogleError = error;
        });
      },
      deleteAccount(){
        this.$store.commit('pushDialogStack', {
          component: 'delete-user-account-dialog',
          elementId: 'delete-account-btn',
        });
      }
    },
  }
</script>
