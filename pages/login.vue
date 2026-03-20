<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserProfile } from '../composables/useUserProfile'

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const router = useRouter()
const { refresh: refreshProfile } = useUserProfile()

const isSignUp = ref(false)
const username = ref('')
const password = ref('')
const loading = ref(false)
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null)

// Redirection si déjà connecté
watch(
  user,
  (u) => {
    if (u) {
      router.push('/')
    }
  },
  { immediate: true }
)

async function handleSubmit() {
  if (!username.value.trim() || !password.value) {
    message.value = { type: 'error', text: 'Nom d\'utilisateur et mot de passe requis.' }
    return
  }

  if (password.value.length < 6) {
    message.value = { type: 'error', text: 'Le mot de passe doit contenir au moins 6 caractères.' }
    return
  }

  loading.value = true
  message.value = null

  try {
    const normalizedUsername = username.value.trim()
    const email = `${normalizedUsername}@beerme.local`

    if (isSignUp.value) {
      const { error } = await supabase.auth.signUp({
        email,
        password: password.value,
        options: {
          data: {
            username: normalizedUsername
          }
        }
      })

      if (error) {
        message.value = { type: 'error', text: error.message }
        return
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: password.value
      })

      if (error) {
        message.value = { type: 'error', text: error.message }
        return
      }
    }

    await refreshProfile()
    await router.push('/')
  } catch (e: unknown) {
    const err = e as { message?: string }
    const text = err?.message ?? 'Une erreur est survenue. Réessayez.'
    message.value = { type: 'error', text }
  } finally {
    loading.value = false
  }
}

function clearMessage() {
  message.value = null
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-amber-950/30 px-4">
    <div class="w-full max-w-md">
      <!-- Carte principale -->
      <div class="bg-stone-900/90 backdrop-blur border border-amber-800/40 rounded-2xl shadow-xl shadow-amber-950/20 overflow-hidden">
        <!-- En-tête avec dégradé bière -->
        <div class="bg-gradient-to-b from-amber-700 to-amber-900 px-8 py-10 text-center">
          <h1 class="text-3xl font-bold text-amber-50 tracking-tight">
            BeerMe
          </h1>
          <p class="text-amber-200/90 mt-1 text-sm">
            {{ isSignUp ? 'Créer un compte' : 'Connexion' }}
          </p>
        </div>

        <form class="p-8 space-y-5" @submit.prevent="handleSubmit">
          <!-- Message feedback -->
          <div
            v-if="message"
            class="p-3 rounded-lg text-sm"
            :class="message.type === 'error' ? 'bg-red-500/20 text-red-200 border border-red-500/40' : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'"
          >
            {{ message.text }}
            <button
              type="button"
              class="float-right text-current opacity-70 hover:opacity-100"
              aria-label="Fermer"
              @click="clearMessage"
            >
              ×
            </button>
          </div>

          <div>
            <label for="username" class="block text-sm font-medium text-amber-100/90 mb-1.5">
              Nom d'utilisateur
            </label>
            <input
              id="username"
              v-model="username"
              type="text"
              autocomplete="username"
              required
              class="w-full px-4 py-3 rounded-lg bg-stone-800/80 border border-amber-800/30 text-amber-50 placeholder-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition"
              placeholder="ex: bierefan42"
              @input="clearMessage"
            >
          </div>

          <div>
            <label for="password" class="block text-sm font-medium text-amber-100/90 mb-1.5">
              Mot de passe
            </label>
            <input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              class="w-full px-4 py-3 rounded-lg bg-stone-800/80 border border-amber-800/30 text-amber-50 placeholder-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition"
              placeholder="••••••••"
              @input="clearMessage"
            >
            <p v-if="isSignUp" class="mt-1 text-xs text-amber-400/70">
              Minimum 6 caractères
            </p>
          </div>

          <button
            type="submit"
            class="w-full py-3 px-4 rounded-lg font-semibold text-amber-950 bg-amber-400 hover:bg-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-stone-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="loading"
          >
            {{ loading ? 'Chargement…' : (isSignUp ? 'Créer mon compte' : 'Se connecter') }}
          </button>
        </form>

        <!-- Bascule login / inscription -->
        <div class="px-8 pb-8 pt-0 text-center">
          <button
            type="button"
            class="text-sm text-amber-400 hover:text-amber-300 underline underline-offset-2 transition"
            @click="isSignUp = !isSignUp; message = null"
          >
            {{ isSignUp ? 'Déjà un compte ? Se connecter' : 'Pas encore de compte ? S\'inscrire' }}
          </button>
        </div>
      </div>

      <p class="mt-6 text-center text-amber-600/80 text-sm">
        BeerMe — trouvez votre prochaine bière.
      </p>
    </div>
  </div>
</template>
