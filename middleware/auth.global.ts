export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()

  const isLoginPage = to.path === '/login'

  if (!user.value && !isLoginPage) {
    return navigateTo('/login')
  }

  if (user.value && isLoginPage) {
    return navigateTo('/')
  }
})
