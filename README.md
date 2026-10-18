# Calendario Millonario 2027 · Parroquia Juan Pablo II

Página para que la gente escoja su número del calendario sin iniciar sesión. Cuando alguien aparta un número, queda en rojo para todos al instante.

- **Página del bono:** la dirección del proyecto en Vercel
- **Panel del vendedor:** la misma dirección con `/vendedor` al final (pide la clave `CLAVE_PANEL`)

## Cómo está montado

- **Vercel** sirve la página y las funciones de `/api`.
- **Vercel Blob (privado)** guarda en un solo archivo JSON los números apartados, los datos de cada comprador y tus datos de contacto. Está conectado al proyecto con la variable `BLOB_READ_WRITE_TOKEN`.
- La variable `CLAVE_PANEL` guarda la clave del panel. Para cambiarla: Vercel → proyecto → Settings → Environment Variables → `CLAVE_PANEL`, y luego vuelve a desplegar.

Cada cambio de un número usa la versión (ETag) del archivo, así dos personas no pueden quedarse con el mismo número aunque lo toquen al mismo tiempo.

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `index.html` | Página del bono y panel del vendedor |
| `api/estado.js` | Números vendidos (sin datos personales) |
| `api/apartar.js` | Aparta números; no permite apartar uno ya tomado |
| `api/panel.js` | Datos del panel, marcar pagado, liberar y datos de contacto (con clave) |
| `lib/db.js` | Lectura y escritura en Vercel Blob, lista de números y valor |

Para cambiar los números o el valor, edita `NUMEROS` y `VALOR` en `lib/db.js`.
