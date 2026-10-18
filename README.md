# Calendario Millonario 2027 · Parroquia Juan Pablo II

Página para que la gente escoja su número del calendario sin iniciar sesión. Cuando alguien aparta un número, queda en rojo para todos al instante.

- **Página del bono:** `https://TU-PROYECTO.vercel.app`
- **Panel del vendedor:** `https://TU-PROYECTO.vercel.app/vendedor` (pide la clave `CLAVE_PANEL`)

## Publicar en Vercel (una sola vez)

1. En [vercel.com](https://vercel.com) entra con tu cuenta de GitHub → **Add New… → Project** → importa este repositorio → **Deploy**.
2. En el proyecto, abre **Storage → Create Database → Upstash for Redis** (plan gratis) y conéctala al proyecto.
3. En **Settings → Environment Variables** crea `CLAVE_PANEL` con la clave que quieras para tu panel.
4. Ve a **Deployments**, abre el último y toca **Redeploy** para que tome la base de datos y la clave.
5. Entra a `/vendedor`, escribe tu clave y guarda tu nombre y tu WhatsApp.

Cada cambio que se suba a la rama `main` se publica solo.

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `index.html` | Página del bono y panel del vendedor |
| `api/estado.js` | Números vendidos (sin datos personales) |
| `api/apartar.js` | Aparta números; no permite apartar uno ya tomado |
| `api/panel.js` | Datos del panel, marcar pagado, liberar y datos de contacto (con clave) |
| `lib/db.js` | Conexión con Upstash Redis y lista de números |

Para cambiar los números o el valor, edita `NUMEROS` y `VALOR` en `lib/db.js`.
