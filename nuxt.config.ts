import { defineNuxtConfig } from 'nuxt/config'

export default defineNuxtConfig({
  modules: [
    '@nuxtjs/supabase',
    '@nuxtjs/tailwindcss',
    '@nuxt/icon'
  ],

  supabase: {
    redirect: false,
    // Variables explicites pour éviter "failed to fetch" (client doit avoir URL + clé)
    url: process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.NUXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY
  },

  compatibilityDate: '2026-02-27'
} as any)