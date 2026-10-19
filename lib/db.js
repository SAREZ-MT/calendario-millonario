// Datos de la rifa guardados en Vercel Blob (almacén privado conectado al proyecto).
// Todo vive en un solo archivo JSON. Cada cambio se guarda solo si el archivo sigue
// en la misma versión que se leyó (ETag), para que dos personas no puedan apartar el
// mismo número al mismo tiempo.
import { get, head, put, BlobPreconditionFailedError, BlobNotFoundError } from '@vercel/blob';

export const NUMEROS = [
  '0522', '0523', '0524', '0525', '0526', '0527', '0528', '0529', '0530', '0531',
  '0532', '0533', '0534', '0535', '0536', '0537', '0538', '0539', '0540'
];
export const VALOR = 50000;

const CARPETA = 'calendario-millonario-2027/';
const RUTA = CARPETA + 'datos.json';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export class SinBaseDeDatos extends Error {}
class LecturaFallida extends Error {}

function traducir(e) {
  const m = String((e && e.message) || '');
  if (/token|BLOB_READ_WRITE|store.*not.*found|unauthori/i.test(m)) return new SinBaseDeDatos(m);
  return e;
}

function vacio() { return { numeros: {}, config: {} }; }

// Cuando el archivo pasa de ~1 KB, la red de Vercel lo entrega comprimido y marca la
// versión como "débil" (W/"..."). Se quita esa marca para comparar versiones.
const version = (e) => String(e || '').trim().replace(/^W\//i, '');

function interpretar(texto) {
  let datos;
  try { datos = JSON.parse(texto); } catch { throw new LecturaFallida('El archivo de datos no se pudo leer.'); }
  if (!datos || typeof datos !== 'object') throw new LecturaFallida('El archivo de datos no se pudo leer.');
  datos.numeros = datos.numeros || {};
  datos.config = datos.config || {};
  return datos;
}

async function leerContenido() {
  let r = null;
  try {
    r = await get(RUTA, { access: 'private', useCache: false });
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw traducir(e);
  }
  if (!r) return null;
  if (r.statusCode !== 200 || !r.stream) throw new LecturaFallida('Lectura incompleta (' + r.statusCode + ').');
  return { datos: interpretar(await new Response(r.stream).text()), etag: version(r.blob && r.blob.etag) };
}

async function versionGuardada() {
  try {
    const m = await head(RUTA);
    return m ? version(m.etag) : null;
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw traducir(e);
  }
}

/** Lectura para mostrar (números vendidos, panel). */
async function leer() {
  const r = await leerContenido();
  return r || { datos: vacio(), etag: null };
}

/** Lectura para modificar: confirma con el almacén que el contenido es la versión vigente. */
async function leerVigente() {
  for (let i = 0; i < 6; i++) {
    const guardada = await versionGuardada();
    if (!guardada) return { datos: vacio(), etag: null };
    const r = await leerContenido();
    if (r && r.etag === guardada) return r;
    await esperar(120 * (i + 1));
  }
  throw new LecturaFallida('No se pudo leer la versión más reciente de los datos.');
}

async function escribir(datos, etag) {
  const opciones = { access: 'private', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 };
  if (etag) { opciones.allowOverwrite = true; opciones.ifMatch = etag; }
  else opciones.allowOverwrite = false;
  await put(RUTA, JSON.stringify(datos), opciones);
}

const vendidosEn = (d) => Object.keys(d.numeros).filter((n) => d.numeros[n] && d.numeros[n].nombre).length;

/** Lee, aplica el cambio y guarda; si otra persona guardó en medio, vuelve a intentar. */
async function modificar(cambio, { puedeQuitar = 0 } = {}) {
  for (let intento = 0; intento < 10; intento++) {
    const { datos, etag } = await leerVigente();
    const antes = vendidosEn(datos);
    const resultado = cambio(datos) || {};
    if (!resultado.guardar) return { ...resultado, datos };
    // Protección: nunca guardar un cambio que borre más compradores de los permitidos.
    if (vendidosEn(datos) < antes - puedeQuitar) throw new Error('Cambio rechazado para proteger los datos.');
    try {
      await escribir(datos, etag);
      return { ...resultado, datos };
    } catch (e) {
      const choque = e instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(String(e && e.message));
      if (!choque) throw traducir(e);
      await esperar(100 + Math.random() * 300 * (intento + 1));
    }
  }
  throw new Error('Hay muchas personas apartando al mismo tiempo. Intenta de nuevo.');
}

/** Copia de respaldo del archivo actual (no reemplaza ninguna anterior). */
export async function respaldar() {
  const r = await leerContenido();
  if (!r) return { ok: true, ruta: null, vendidos: 0 };
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const ruta = CARPETA + 'respaldos/datos-' + sello + '.json';
  await put(ruta, JSON.stringify(r.datos), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false });
  return { ok: true, ruta, vendidos: vendidosEn(r.datos) };
}

function filasDe(datos) {
  return NUMEROS.map((n) => {
    const d = datos.numeros[n] || {};
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

function vendidosDe(datos) {
  return NUMEROS.filter((n) => datos.numeros[n] && datos.numeros[n].nombre);
}

function configDe(datos) {
  return { nombreVendedor: datos.config.nombreVendedor || '', whatsappVendedor: datos.config.whatsappVendedor || '' };
}

/** Lectura completa en una sola consulta. */
export async function leerTodo() {
  const { datos } = await leer();
  return { filas: filasDe(datos), vendidos: vendidosDe(datos), config: configDe(datos) };
}

/** Aparta varios números a la vez; si alguno ya estaba tomado, no aparta ninguno. */
export async function apartarNumeros(nums, persona) {
  const r = await modificar((d) => {
    const tomados = nums.filter((n) => d.numeros[n] && d.numeros[n].nombre);
    if (tomados.length) return { tomados };
    const fecha = new Date().toISOString();
    nums.forEach((n) => { d.numeros[n] = { ...persona, fecha, pagado: false }; });
    return { tomados: [], guardar: true };
  });
  return { tomados: r.tomados, vendidos: vendidosDe(r.datos) };
}

export async function marcarPagado(n, pagado) {
  const r = await modificar((d) => {
    if (!d.numeros[n] || !d.numeros[n].nombre) return { ok: false };
    d.numeros[n].pagado = !!pagado;
    return { ok: true, guardar: true };
  });
  return r.ok;
}

export async function liberarNumero(n) {
  await modificar((d) => {
    if (!d.numeros[n]) return {};
    delete d.numeros[n];
    return { guardar: true };
  }, { puedeQuitar: 1 });
}

export async function guardarConfig(cfg) {
  await modificar((d) => { d.config = cfg; return { guardar: true }; });
}

/** Recorta y limpia un texto que escribió un visitante. */
export function texto(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

export function mensajeError(e) {
  if (e instanceof SinBaseDeDatos) return 'La página todavía no tiene su base de datos conectada.';
  const m = String((e && e.message) || '');
  if (/muchas personas/.test(m)) return m;
  return 'No se pudo conectar con la base de datos. Intenta de nuevo en un momento.';
}

/** Lee el cuerpo JSON de la petición (Vercel ya lo convierte cuando llega como JSON). */
export function cuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
