// Datos de la rifa guardados en Vercel Blob (almacén privado conectado al proyecto).
// Todo vive en un solo archivo JSON; cada cambio usa la ETag del archivo para que
// dos personas no puedan apartar el mismo número al mismo tiempo.
import { get, head, put, BlobPreconditionFailedError, BlobNotFoundError } from '@vercel/blob';

export const NUMEROS = [
  '0522', '0523', '0524', '0525', '0526', '0527', '0528', '0529', '0530', '0531',
  '0532', '0533', '0534', '0535', '0536', '0537', '0538', '0539', '0540'
];
export const VALOR = 50000;

const RUTA = 'calendario-millonario-2027/datos.json';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export class SinBaseDeDatos extends Error {}

function traducir(e) {
  const m = String((e && e.message) || '');
  if (/token|BLOB_READ_WRITE|store.*not.*found|unauthori/i.test(m)) return new SinBaseDeDatos(m);
  return e;
}

function vacio() { return { numeros: {}, config: {} }; }

async function leer() {
  let r = null;
  try {
    r = await get(RUTA, { access: 'private', useCache: false });
  } catch (e) {
    if (!(e instanceof BlobNotFoundError)) throw traducir(e);
  }
  if (!r || r.statusCode !== 200 || !r.stream) return { datos: vacio(), etag: null };
  let datos;
  try { datos = JSON.parse(await new Response(r.stream).text()); } catch { datos = vacio(); }
  datos.numeros = datos.numeros || {};
  datos.config = datos.config || {};
  return { datos, etag: r.blob && r.blob.etag };
}

async function escribir(datos, etag) {
  const opciones = { access: 'private', contentType: 'application/json', addRandomSuffix: false, cacheControlMaxAge: 60 };
  if (etag) { opciones.allowOverwrite = true; opciones.ifMatch = etag; }
  else opciones.allowOverwrite = false;
  await put(RUTA, JSON.stringify(datos), opciones);
}

/** Lee, aplica el cambio y guarda; si otra persona guardó en medio, vuelve a intentar. */
async function modificar(cambio) {
  for (let intento = 0; intento < 8; intento++) {
    const { datos, etag } = await leer();
    const resultado = cambio(datos) || {};
    if (!resultado.guardar) return { ...resultado, datos };
    try {
      await escribir(datos, etag);
      return { ...resultado, datos };
    } catch (e) {
      const choque = e instanceof BlobPreconditionFailedError || /already exists|precondition/i.test(String(e && e.message));
      if (!choque) throw traducir(e);
      await esperar(80 + Math.random() * 250);
    }
  }
  throw new Error('Hay muchas personas apartando al mismo tiempo. Intenta de nuevo.');
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
  });
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

/** Diagnóstico técnico (sin datos personales): compara la versión guardada con la que se lee. */
export async function diagnostico() {
  const out = {};
  try {
    const m = await head(RUTA);
    out.head = { etag: m.etag, size: m.size, uploadedAt: m.uploadedAt };
  } catch (e) { out.head = { error: String(e && e.message) }; }
  for (const modo of ['sinCache', 'conCache']) {
    try {
      const r = await get(RUTA, modo === 'sinCache' ? { access: 'private', useCache: false } : { access: 'private' });
      if (!r) { out[modo] = { nulo: true }; continue; }
      const h = r.headers;
      const texto = r.stream ? await new Response(r.stream).text() : '';
      let n = null; try { n = Object.keys(JSON.parse(texto).numeros || {}).length; } catch {}
      out[modo] = {
        status: r.statusCode, etag: r.blob && r.blob.etag, bytes: Buffer.byteLength(texto),
        entradas: n, encoding: h.get('content-encoding'), length: h.get('content-length'),
        cache: h.get('x-vercel-cache'), age: h.get('age'), lastModified: h.get('last-modified')
      };
    } catch (e) { out[modo] = { error: String(e && e.message) }; }
  }
  return out;
}
