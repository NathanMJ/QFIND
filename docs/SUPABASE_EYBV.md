# Supabase (projet `eybvjylqsiyvycaqkcqb`)

## Pourquoi tu ne voyais pas les tables

Les tables ont été créées sur **un autre** projet Supabase tant que le MCP / les variables d’environnement ne pointaient pas vers `eybv...`. Ce dépôt est maintenant configuré pour **ton** projet.

## 1) Appliquer le schéma + RPC + seed

1. Ouvre le dashboard : [Projet eybv](https://supabase.com/dashboard/project/eybvjylqsiyvycaqkcqb)
2. **SQL Editor** → colle le contenu de [`supabase/sql/qfind_init_eybv.sql`](../supabase/sql/qfind_init_eybv.sql) → **Run**

Vérification rapide :

```sql
select jsonb_pretty(public.get_nearby(31.6688, 34.5718, 5, 10));
```

## 2) Configurer l’app (Expo)

1. Dans **Project Settings → API**, copie :
   - **Project URL** → doit être `https://eybvjylqsiyvycaqkcqb.supabase.co`
   - **anon public** key
2. Mets-les dans ton fichier `.env` :

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

Tu peux partir de [`.env.example`](../.env.example).

## 3) MCP Cursor

Le fichier [`.cursor/mcp.json`](../.cursor/mcp.json) doit utiliser :

`https://mcp.supabase.com/mcp?project_ref=eybvjylqsiyvycaqkcqb`

Puis **redémarre Cursor** (ou Reload Window) pour que le serveur MCP se reconnecte au bon projet.

## Note

Le projet `sggfvtanbgqdbddciydf` est **un autre** Supabase : ne pas l’utiliser pour QFind.
