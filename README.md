# RefFlow

Aplicación web para organizar designaciones, partidos, tarifas, ganancias y análisis de vídeo de árbitros de baloncesto.

## Desarrollo local

Requisitos: Node.js 22 y pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

La aplicación utiliza Supabase Auth y una tabla `public.user_states` protegida con Row Level Security. Cada usuario solo puede leer y modificar su propio estado.

## Variables de entorno

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

`LEGACY_OWNER_EMAIL` solo se utiliza en el despliegue original de ChatGPT Sites para migrar el estado antiguo de D1. No es necesario configurarlo en Vercel.

## Compilación

```bash
pnpm build
```

El script detecta Vercel y utiliza Next.js; en ChatGPT Sites mantiene el proceso de compilación de Vinext.
