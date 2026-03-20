import { createError, defineEventHandler, getHeader, readBody } from 'h3'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'

function getOrigin(event: Parameters<typeof getHeader>[0]): string {
  const host = getHeader(event, 'host') || 'localhost:3000'
  const forwarded = getHeader(event, 'x-forwarded-proto')
  const proto = forwarded === 'https' || getHeader(event, 'x-forwarded-ssl') ? 'https' : 'http'
  return `${proto}://${host}`
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    action: 'signUp' | 'signIn'
    username: string
    password: string
  }>(event).catch(() => null)

  if (!body?.username || !body?.password || !body?.action) {
    throw createError({
      statusCode: 400,
      message: 'username, password et action (signUp | signIn) requis.'
    })
  }

  const supabase = await serverSupabaseClient(event)
  const supabaseAdmin = await serverSupabaseServiceRole(event)
  const origin = getOrigin(event)

  const email = `${body.username}@beerme.local`

  if (body.action === 'signUp') {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: body.password,
      options: {
        emailRedirectTo: `${origin}/`,
        data: {
          username: body.username
        }
      }
    })
    if (error) {
      throw createError({ statusCode: error.status ?? 400, message: error.message })
    }
    const userId = data.user?.id
    const username = body.username

    if (userId) {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: userId,
          username
        })

      if (profileError && profileError.code !== '23505') {
        // 23505 = violation de contrainte unique, on l'ignore si le profil existe déjà
        throw createError({ statusCode: 500, message: profileError.message })
      }
    }

    return { data, error: null }
  }

  if (body.action === 'signIn') {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: body.password
    })
    if (error) {
      throw createError({ statusCode: error.status ?? 401, message: error.message })
    }
    return { data, error: null }
  }

  throw createError({ statusCode: 400, message: 'action invalide' })
})
