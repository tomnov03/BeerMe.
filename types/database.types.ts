// Types Supabase minimalistes pour activer le typage dans Nuxt.
// Adapte ce fichier si tu ajoutes d'autres tables / colonnes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          updated_at: string
        }
        Insert: {
          id?: string
          username: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          updated_at?: string
        }
        Relationships: []
      },
      degustations: {
        Row: {
          id: string
          user_id: string
          beer_api_id: string | null
          beer_name: string | null
          note_plaisir: number | null
          note_amertume: number | null
          prix: number | null
          bar_name: string | null
          location_lat: number | null
          location_lng: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          beer_api_id?: string | null
          beer_name?: string | null
          note_plaisir?: number | null
          note_amertume?: number | null
          prix?: number | null
          bar_name?: string | null
          location_lat?: number | null
          location_lng?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          beer_api_id?: string | null
          beer_name?: string | null
          note_plaisir?: number | null
          note_amertume?: number | null
          prix?: number | null
          bar_name?: string | null
          location_lat?: number | null
          location_lng?: number | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_: string]: never
    }
    Functions: {
      [_: string]: never
    }
    Enums: {
      [_: string]: never
    }
  }
}

