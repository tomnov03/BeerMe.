export function useUserProfile() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  const profile = ref<any | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)

  async function fetchProfile() {
    if (!user.value?.id) {
      profile.value = null
      loading.value = false
      return
    }

    loading.value = true
    error.value = null

    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, username, updated_at')
      .eq('id', user.value.id)
      .single()

    if (err) {
      error.value = err.message
      profile.value = null
    } else {
      profile.value = data as UserProfile
    }

    loading.value = false
  }

  async function updateProfile(updates: { username?: string }) {
    if (!user.value?.id) return { error: new Error('Non connecté') }

    const { data, error: err } = await supabase
      .from('profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.value.id)
      .select()
      .single()

    if (err) {
      error.value = err.message
      return { error: err, data: null }
    }

    profile.value = data
    return { error: null, data: profile.value }
  }

  watch(user, fetchProfile, { immediate: true })

  return {
    profile: readonly(profile),
    loading: readonly(loading),
    error: readonly(error),
    refresh: fetchProfile,
    updateProfile
  }
}
