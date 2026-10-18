// Acceso a la base de datos (Upstash Redis, conectada desde Vercel → Storage).
// Se usa la API REST de Upstash con fetch, sin dependencias.

export const NUMEROS = [
  '0522', '0523', '0524', '0525', '0526', '0527', '0528', '0529', '0530', '0531',
  '0532', '0533', '0534', '0535', '0536', '0537', '0538', '0539', '0540'
];
export const VALOR = 50000;

const PREFIJO = 'cm2027:';
const claveNumero = (n) => PREFIJO + 'n:' + n;
const CLAVE_CONFIG = PREFIJO + 'config';

function credenciales() {
  const env = process.env;
  const nombres = Object.keys(env);
  const buscar = (exacto, patron) =>
    env[exacto] || env[nombres.find((k) => patron.test(k) && !/READ_ONLY/.test(k))];
  const url = buscar('KV_REST_API_URL', /KV_REST_API_URL$/) || buscar('UPSTASH_REDIS_REST_URL', /REDIS_REST_URL$/);
  const token = buscar('KV_REST_API_TOKEN', /KV_REST_API_TOKEN$/) || buscar('UPSTASH_REDIS_REST_TOKEN', /REDIS_REST_TOKEN$/);
  return { url, token };
}

export class SinBaseDeDatos extends Error {}

/** Ejecuta un comando de Redis, por ejemplo ['GET', 'clave']. */
export async function cmd(partes) {
  const { url, token } = credenciales();
  if (!url || !token) throw new SinBaseDeDatos('Falta conectar la base de datos');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(partes)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'Error de la base de datos (' + r.status + ')');
  return j.result;
}

function leerJSON(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

/** Todas las filas: un objeto por número (nombre vacío = disponible). */
export async function leerTodos() {
  const valores = await cmd(['MGET', ...NUMEROS.map(claveNumero)]);
  return NUMEROS.map((n, i) => {
    const d = leerJSON(valores && valores[i]) || {};
    return {
      numero: n,
      nombre: d.nombre || '',
      celular: d.celular || '',
      nota: d.nota || '',
      fecha: d.fecha || '',
      pagado: d.pagado === true
    };
  });
}

export async function vendidos() {
  return (await leerTodos()).filter((f) => f.nombre).map((f) => f.numero);
}

/** Aparta varios números a la vez; si alguno ya estaba tomado no aparta ninguno. */
export async function apartarNumeros(nums, datos) {
  const valor = JSON.stringify({ ...datos, fecha: new Date().toISOString(), pagado: false });
  const puestos = [];
  const tomados = [];
  for (const n of nums) {
    const r = await cmd(['SET', claveNumero(n), valor, 'NX']);
    if (r === 'OK') puestos.push(n); else tomados.push(n);
  }
  if (tomados.length && puestos.length) await cmd(['DEL', ...puestos.map(claveNumero)]);
  return { tomados };
}

export async function marcarPagado(n, pagado) {
  const d = leerJSON(await cmd(['GET', claveNumero(n)]));
  if (!d) return false;
  d.pagado = !!pagado;
  await cmd(['SET', claveNumero(n), JSON.stringify(d), 'XX']);
  return true;
}

export async function liberarNumero(n) {
  await cmd(['DEL', claveNumero(n)]);
}

export async function leerConfig() {
  return leerJSON(await cmd(['GET', CLAVE_CONFIG])) || {};
}

export async function guardarConfig(cfg) {
  await cmd(['SET', CLAVE_CONFIG, JSON.stringify(cfg)]);
}

/** Recorta y limpia un texto que escribió un visitante. */
export function texto(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

export function mensajeError(e) {
  if (e instanceof SinBaseDeDatos) {
    return 'La página todavía no tiene base de datos. En Vercel, abre el proyecto → Storage → conecta Upstash Redis y vuelve a desplegar.';
  }
  return 'No se pudo conectar con la base de datos. Intenta de nuevo en un momento.';
}

/** Lee el cuerpo JSON de la petición (Vercel ya lo convierte cuando llega como JSON). */
export function cuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
