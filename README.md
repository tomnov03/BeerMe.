# 🍺 BeerMe

Application mobile de notation de bières. Note celles que tu bois, retrouve-les sur une carte, et découvre de nouvelles bières basées sur tes goûts.

---

## Stack

| Couche | Techno |
|---|---|
| Framework | Nuxt 3 (Vue 3) |
| Auth & BDD | Supabase |
| Carte | Leaflet.js (CDN) |
| API bières | [catalog.beer](https://catalog.beer/api-docs) |
| Géocodage bars | Nominatim (OpenStreetMap) |
| Style | Tailwind CSS |

---

## Fonctionnalités

- **Ma Cave** — liste de tes dégustations avec note de kiff, amertume, nom du bar et localisation sur carte
- **Découvrir** — suggestions personnalisées basées sur les styles de ta cave + bières régionales via l'API catalog.beer
- **Notation** — drawer de dégustation avec recherche dans le catalogue catalog.beer, notation 1-5, prix, et géolocalisation du bar via Nominatim
- **Carte** — carte Leaflet centrée sur ta position avec les brasseries proches et tes bars marqués avec numéros
- **Profil** — page profil avec avatar, compteur de dégustations, déconnexion

---

## Variables d'environnement

Crée un fichier `.env` à la racine :

```env
# Supabase
SUPABASE_URL=https://xxxxxx.supabase.co
SUPABASE_KEY=your_anon_key

# catalog.beer API
CATALOG_BEER_API_KEY=your_api_key
```

> La clé API catalog.beer est disponible sur [catalog.beer/account](https://catalog.beer/account) après inscription.

---

## Installation

```bash
# Installer les dépendances
npm install

# Lancer en développement
npm run dev

# Build production
npm run build
```

---

## Base de données Supabase

### Table `profiles`

```sql
CREATE TABLE public.profiles (
  id   UUID PRIMARY KEY REFERENCES auth.users(id),
  username TEXT NOT NULL
);
```

### Table `degustations`

```sql
CREATE TABLE public.degustations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  beer_api_id  TEXT,
  beer_name    TEXT,
  note_plaisir INTEGER CHECK (note_plaisir BETWEEN 1 AND 5),
  note_amertume INTEGER CHECK (note_amertume BETWEEN 1 AND 5),
  prix         NUMERIC,
  bar_name     TEXT,
  latitude     DOUBLE PRECISION,
  longitude    DOUBLE PRECISION,
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

### Row Level Security

```sql
-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lecture propre" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Insertion propre" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Dégustations
ALTER TABLE public.degustations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD propre" ON public.degustations USING (auth.uid() = user_id);
```

---

## Structure des fichiers clés

```
├── pages/
│   ├── index.vue          # Page principale (Ma Cave + Découvrir)
│   ├── login.vue          # Connexion / Inscription
│   └── profile.vue        # Page profil
├── server/api/
│   ├── beers.ts           # Proxy catalog.beer (search, suggestions, nearby, brewerBeers)
│   └── auth.post.ts       # Endpoint d'authentification custom
└── composables/
    └── useUserProfile.ts  # Composable profil utilisateur
```

---

## API proxy — `server/api/beers.ts`

Toutes les requêtes vers catalog.beer passent par ce proxy côté serveur pour ne pas exposer la clé API au client.

| Action | Endpoint catalog.beer | Usage |
|---|---|---|
| `search` | `GET /beer/search?q=` | Recherche manuelle |
| `suggestions` | `GET /beer/search?q=` | Suggestions "Pour toi" |
| `nearby` | `GET /location/nearby` | Brasseries à moins de 100 km |
| `brewerBeers` | `GET /brewer/{id}/beer` | Bières d'une brasserie |
| `barSearch` | Nominatim OSM | Autocomplétion du nom de bar |

---

## Auth

L'authentification utilise Supabase Auth avec un email fictif au format `{username}@beerme.local` pour permettre une connexion par pseudo sans email réel.
