# Berserk AI Studio

## API routing

Local development uses the Vite proxy. Frontend requests go to `/berserk/...` and are forwarded to the local backend:

```bash
npm run dev
```

The default local backend target is `http://127.0.0.1:8080`. Override it when needed:

```bash
VITE_DEV_BACKEND_URL=http://127.0.0.1:8081 npm run dev
```

Production builds default to the live API base:

```bash
npm run build
```

The generated bundle calls `https://www.berserk-ai.com/berserk/...` unless `VITE_API_BASE_URL` is set during build.
