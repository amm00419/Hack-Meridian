# Backend de AidRelease (Supabase)

No hay servidor propio: se usa Supabase (Postgres + Storage).

1. Crea el proyecto en supabase.com.
2. En el SQL Editor, ejecuta `supabase/migrations/20261025000000_init.sql`.
3. (Opcional) Ejecuta `supabase/seed.sql` para cargar las becas de demostración.
4. Copia la URL y la clave anon en `frontend/.env` (ver `frontend/.env.example`).

Detalles del esquema, el flujo y las limitaciones: `docs/integracion-supabase-stellar.md`.
