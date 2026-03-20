# Supabase – BeerMe

## Appliquer les migrations

1. Ouvre ton projet sur [app.supabase.com](https://app.supabase.com).
2. Va dans **SQL Editor**.
3. Copie-colle le contenu de `migrations/20250228000000_profiles.sql` et exécute-le.

Cela crée la table `profiles`, les politiques RLS et le trigger qui crée automatiquement un profil à chaque inscription.
