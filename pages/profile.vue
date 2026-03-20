<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

const router = useRouter()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { profile } = useUserProfile()

// ── Compteur dégustations ──
const degustationsCount = ref<number>(0)
const loadingCount = ref(true)

async function loadDegustationsCount() {
  loadingCount.value = true
  try {
    let userId = user.value?.id ?? null
    if (!userId) {
      const { data } = await supabase.auth.getUser()
      userId = data.user?.id ?? null
    }
    if (!userId) { degustationsCount.value = 0; return }

    const { count, error } = await supabase
      .from('degustations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    degustationsCount.value = error ? 0 : (count ?? 0)
  } finally {
    loadingCount.value = false
  }
}

onMounted(() => loadDegustationsCount())
watch(user, (u) => { if (u) loadDegustationsCount(); else degustationsCount.value = 0 })

// ── Date d'inscription ──
const memberSince = computed(() => {
  const raw = user.value?.created_at
  if (!raw) return null
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(raw))
})

// ── Changement de mot de passe ──
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrentPwd = ref(false)
const showNewPwd = ref(false)
const showConfirmPwd = ref(false)
const pwdLoading = ref(false)
const pwdError = ref<string | null>(null)
const pwdSuccess = ref(false)

async function updatePassword() {
  pwdError.value = null
  pwdSuccess.value = false

  if (!currentPassword.value) {
    pwdError.value = 'Saisis ton mot de passe actuel.'
    return
  }
  if (newPassword.value.length < 6) {
    pwdError.value = 'Le nouveau mot de passe doit faire au moins 6 caractères.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    pwdError.value = 'Les mots de passe ne correspondent pas.'
    return
  }

  pwdLoading.value = true
  try {
    const email = user.value?.email ?? ''
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword.value
    })
    if (signInError) {
      pwdError.value = 'Mot de passe actuel incorrect.'
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword.value
    })
    if (updateError) {
      pwdError.value = updateError.message
      return
    }

    pwdSuccess.value = true
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } finally {
    pwdLoading.value = false
  }
}

// ── Déconnexion ──
async function signOut() {
  await supabase.auth.signOut()
  await router.push('/login')
}

function goBack() {
  router.back()
}
</script>

<template>
  <div class="min-h-screen flex flex-col" style="background: #faf8f5; color: #b45309; font-family: -apple-system, 'Helvetica Neue', sans-serif;">
    <div class="w-full max-w-lg mx-auto flex-1 px-4 py-8 flex flex-col gap-5">

      <!-- Header -->
      <header class="flex items-center justify-between mb-2">
        <button
          type="button"
          class="flex items-center justify-center rounded-full transition"
          style="width: 40px; height: 40px; background: #fff; border: 1px solid #ede9df; color: #b45309;"
          @click="goBack"
        >
          ←
        </button>
        <h1 class="font-semibold" style="font-size: 17px; color: #b45309;">
          Profil
        </h1>
        <div style="width: 40px;" />
      </header>

      <!-- Carte identité -->
      <section style="background: #fff; border: 1px solid #ede9df; border-radius: 20px; padding: 28px 24px; text-align: center;">
        <div
          class="mx-auto flex items-center justify-center rounded-full"
          style="width: 72px; height: 72px; background: #fdf3e7; border: 2px solid #ede9df; color: #b45309; font-size: 28px; font-weight: 700; margin-bottom: 14px;"
        >
          <span v-if="profile?.username">{{ profile.username.charAt(0).toUpperCase() }}</span>
          <svg
            v-else
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </div>
        <p style="font-size: 22px; font-weight: 700; color: #b45309; font-family: Georgia, serif; margin-bottom: 4px;">
          {{ profile?.username ?? 'Utilisateur' }}
        </p>
        <p style="font-size: 13px; color: #c0b89a;">
          {{ user?.email ?? '' }}
        </p>
      </section>

      <!-- Stats : dégustations + membre depuis -->
      <div class="grid grid-cols-2 gap-3">
        <div style="background: #fff; border: 1px solid #ede9df; border-radius: 16px; padding: 18px 16px;">
          <p style="font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #d97706; margin-bottom: 8px;">
            Dégustations
          </p>
          <div class="flex items-end gap-2">
            <span style="font-size: 32px; font-weight: 800; color: #b45309; line-height: 1;">
              <template v-if="loadingCount">…</template>
              <template v-else>{{ degustationsCount }}</template>
            </span>
            <span style="font-size: 18px; margin-bottom: 2px;">🍺</span>
          </div>
        </div>
        <div style="background: #fff; border: 1px solid #ede9df; border-radius: 16px; padding: 18px 16px;">
          <p style="font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #d97706; margin-bottom: 8px;">
            Membre depuis
          </p>
          <p style="font-size: 14px; font-weight: 600; color: #b45309; line-height: 1.3;">
            {{ memberSince ?? '—' }}
          </p>
        </div>
      </div>

      <!-- Changement de mot de passe -->
      <section style="background: #fff; border: 1px solid #ede9df; border-radius: 20px; padding: 24px;">
        <div class="flex items-center gap-2 mb-5">
          <span style="font-size: 16px;">🔒</span>
          <p style="font-size: 14px; font-weight: 700; color: #b45309;">
            Changer le mot de passe
          </p>
        </div>

        <div class="flex flex-col gap-3">
          <!-- Mot de passe actuel -->
          <div>
            <label style="display: block; font-size: 11px; font-weight: 600; color: #c0b89a; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">
              Mot de passe actuel
            </label>
            <div style="position: relative;">
              <input
                v-model="currentPassword"
                :type="showCurrentPwd ? 'text' : 'password'"
                autocomplete="current-password"
                style="width: 100%; padding: 11px 40px 11px 14px; border-radius: 12px; border: 1.5px solid #ede9df; background: #faf8f5; font-size: 14px; color: #7c4a1e; outline: none; box-sizing: border-box; font-family: inherit; transition: border-color 0.15s;"
                placeholder="••••••••"
                @focus="($event.target as HTMLInputElement).style.borderColor = '#d97706'"
                @blur="($event.target as HTMLInputElement).style.borderColor = '#ede9df'"
              >
              <button
                type="button"
                style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #c0b89a; font-size: 15px; padding: 0;"
                @click="showCurrentPwd = !showCurrentPwd"
              >{{ showCurrentPwd ? '🙈' : '👁' }}</button>
            </div>
          </div>

          <!-- Nouveau mot de passe -->
          <div>
            <label style="display: block; font-size: 11px; font-weight: 600; color: #c0b89a; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">
              Nouveau mot de passe
            </label>
            <div style="position: relative;">
              <input
                v-model="newPassword"
                :type="showNewPwd ? 'text' : 'password'"
                autocomplete="new-password"
                style="width: 100%; padding: 11px 40px 11px 14px; border-radius: 12px; border: 1.5px solid #ede9df; background: #faf8f5; font-size: 14px; color: #7c4a1e; outline: none; box-sizing: border-box; font-family: inherit; transition: border-color 0.15s;"
                placeholder="6 caractères minimum"
                @focus="($event.target as HTMLInputElement).style.borderColor = '#d97706'"
                @blur="($event.target as HTMLInputElement).style.borderColor = '#ede9df'"
              >
              <button
                type="button"
                style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #c0b89a; font-size: 15px; padding: 0;"
                @click="showNewPwd = !showNewPwd"
              >{{ showNewPwd ? '🙈' : '👁' }}</button>
            </div>
          </div>

          <!-- Confirmer -->
          <div>
            <label style="display: block; font-size: 11px; font-weight: 600; color: #c0b89a; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">
              Confirmer le nouveau mot de passe
            </label>
            <div style="position: relative;">
              <input
                v-model="confirmPassword"
                :type="showConfirmPwd ? 'text' : 'password'"
                autocomplete="new-password"
                style="width: 100%; padding: 11px 40px 11px 14px; border-radius: 12px; border: 1.5px solid #ede9df; background: #faf8f5; font-size: 14px; color: #7c4a1e; outline: none; box-sizing: border-box; font-family: inherit; transition: border-color 0.15s;"
                placeholder="••••••••"
                @focus="($event.target as HTMLInputElement).style.borderColor = '#d97706'"
                @blur="($event.target as HTMLInputElement).style.borderColor = '#ede9df'"
              >
              <button
                type="button"
                style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #c0b89a; font-size: 15px; padding: 0;"
                @click="showConfirmPwd = !showConfirmPwd"
              >{{ showConfirmPwd ? '🙈' : '👁' }}</button>
            </div>
          </div>

          <!-- Feedback erreur / succès -->
          <div
            v-if="pwdError"
            style="padding: 10px 14px; border-radius: 10px; background: #fef2f2; border: 1px solid #fecaca; font-size: 13px; color: #dc2626;"
          >
            {{ pwdError }}
          </div>
          <div
            v-if="pwdSuccess"
            style="padding: 10px 14px; border-radius: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; font-size: 13px; color: #16a34a;"
          >
            ✓ Mot de passe mis à jour avec succès.
          </div>

          <!-- Bouton mettre à jour -->
          <button
            type="button"
            class="transition active:scale-[0.98]"
            style="width: 100%; min-height: 44px; border-radius: 12px; background: #b45309; color: #fffbf0; font-size: 14px; font-weight: 600; border: none; cursor: pointer; font-family: inherit; margin-top: 2px;"
            :style="pwdLoading ? { opacity: '0.6', cursor: 'not-allowed' } : {}"
            :disabled="pwdLoading"
            @click="updatePassword"
          >
            {{ pwdLoading ? 'Mise à jour…' : 'Mettre à jour le mot de passe' }}
          </button>
        </div>
      </section>

      <!-- Déconnexion -->
      <button
        type="button"
        class="transition active:scale-[0.98]"
        style="width: 100%; min-height: 44px; border-radius: 14px; background: #fff; color: #b45309; font-size: 14px; font-weight: 600; border: 1.5px solid #ede9df; cursor: pointer; font-family: inherit;"
        @click="signOut"
      >
        Se déconnecter
      </button>

    </div>
  </div>
</template>
