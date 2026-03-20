declare global {
  // Composables Nuxt exposés globalement dans les SFC
  // Typés en any pour simplifier la config TS locale.
  const useSupabaseClient: any
  const useSupabaseUser: any
  const defineNuxtRouteMiddleware: any
  const navigateTo: any
}

export {}
