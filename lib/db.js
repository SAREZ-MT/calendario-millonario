// Datos de la rifa guardados en Vercel Blob (almacén privado conectado al proyecto).
// Todo vive en un solo archivo JSON. Cada cambio se guarda solo si el archivo sigue
// en la misma versión que se leyó (ETag), para que dos personas no puedan apartar el
// mismo número al mismo tiempo.
import { get, head, put, BlobPreconditionFailedError, BlobNotFoundError } from '@vercel/blob';

// Números con los que empezó la rifa. Los que se agreguen desde el panel quedan
// guardados en el archivo de datos (campo "lista").
export const NUMEROS = [
  '0522', '0523', '0524', '0525', '0526', '0527', '0528', '0529', '0530', '0531',
  '0532', '0533', '0534', '0535', '0536', '0537', '0538', '0539', '0540'
];
export const VALOR = 50000;
export const MAX_NUMEROS = 400;

/** Convierte lo que se escribió en un número de 4 cifras ("541" → "0541"); null si no sirve. */
export function normalizarNumero(v) {
  const d = String(v == null ? '' : v).trim();
  if (!/^\d{1,6}$/.test(d)) return null;
  return d.length < 4 ? d.padStart(4, '0') : d;
}

const ordenarNumeros = (a) => a.slice().sort((x, y) => Number(x) - Number(y) || x.localeCompare(y));

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

/** Lista vigente de números. Nunca deja por fuera un número que tenga comprador. */
function listaDe(datos) {
  const base = Array.isArray(datos.lista) ? datos.lista : NUMEROS;
  const conComprador = Object.keys(datos.numeros).filter((n) => datos.numeros[n] && datos.numeros[n].nombre);
  return ordenarNumeros(Array.from(new Set(base.concat(conComprador))));
}

function filasDe(datos) {
  return listaDe(datos).map((n) => {
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
  return listaDe(datos).filter((n) => datos.numeros[n] && datos.numeros[n].nombre);
}

function configDe(datos) {
  return { nombreVendedor: datos.config.nombreVendedor || '', whatsappVendedor: datos.config.whatsappVendedor || '' };
}

/** Lectura completa en una sola consulta. */
export async function leerTodo() {
  const { datos } = await leer();
  return { numeros: listaDe(datos), filas: filasDe(datos), vendidos: vendidosDe(datos), config: configDe(datos) };
}

/** Respuesta completa para el panel a partir de los datos ya leídos. */
export function resumenPanel(datos) {
  return { numeros: listaDe(datos), filas: filasDe(datos), config: configDe(datos) };
}

/** Aparta varios números a la vez; si alguno ya estaba tomado, no aparta ninguno. */
export async function apartarNumeros(nums, persona) {
  const r = await modificar((d) => {
    const lista = listaDe(d);
    const invalidos = nums.filter((n) => !lista.includes(n));
    if (invalidos.length) return { tomados: [], invalidos };
    const tomados = nums.filter((n) => d.numeros[n] && d.numeros[n].nombre);
    if (tomados.length) return { tomados };
    const fecha = new Date().toISOString();
    nums.forEach((n) => { d.numeros[n] = { ...persona, fecha, pagado: false }; });
    return { tomados: [], guardar: true };
  });
  return { tomados: r.tomados || [], invalidos: r.invalidos || [], vendidos: vendidosDe(r.datos) };
}

export async function marcarPagado(n, pagado) {
  const r = await modificar((d) => {
    if (!d.numeros[n] || !d.numeros[n].nombre) return { ok: false };
    d.numeros[n].pagado = !!pagado;
    return { ok: true, guardar: true };
  });
  return r;
}

export async function liberarNumero(n) {
  return modificar((d) => {
    if (!d.numeros[n]) return {};
    delete d.numeros[n];
    return { guardar: true };
  }, { puedeQuitar: 1 });
}

/** Agrega números disponibles a la rifa. Los que ya estaban se dejan igual. */
export async function agregarNumeros(nums) {
  const r = await modificar((d) => {
    const lista = listaDe(d);
    const nuevos = nums.filter((n, i) => !lista.includes(n) && nums.indexOf(n) === i);
    if (!nuevos.length) return { agregados: [], yaEstaban: nums.length };
    if (lista.length + nuevos.length > MAX_NUMEROS) return { error: 'La rifa no puede pasar de ' + MAX_NUMEROS + ' números.' };
    d.lista = ordenarNumeros(lista.concat(nuevos));
    return { agregados: nuevos, yaEstaban: nums.length - nuevos.length, guardar: true };
  });
  return r;
}

/**
 * Registra un comprador en un número (lo agrega a la rifa si no estaba).
 * Nunca reemplaza a un comprador que ya exista en ese número.
 */
export async function registrarComprador(n, persona, pagado) {
  const r = await modificar((d) => {
    const lista = listaDe(d);
    const actual = d.numeros[n];
    if (actual && actual.nombre) return { error: 'El ' + n + ' ya está a nombre de ' + actual.nombre + '. Si quieres cambiarlo, primero libéralo.' };
    const nuevo = !lista.includes(n);
    if (nuevo && lista.length + 1 > MAX_NUMEROS) return { error: 'La rifa no puede pasar de ' + MAX_NUMEROS + ' números.' };
    if (nuevo) d.lista = ordenarNumeros(lista.concat([n]));
    d.numeros[n] = { ...persona, fecha: new Date().toISOString(), pagado: !!pagado };
    return { nuevo, guardar: true };
  });
  return r;
}

/** Quita de la rifa un número que no tenga comprador (por ejemplo, uno agregado por error). */
export async function quitarNumero(n) {
  const r = await modificar((d) => {
    const lista = listaDe(d);
    if (!lista.includes(n)) return { error: 'El ' + n + ' no está en la rifa.' };
    if (d.numeros[n] && d.numeros[n].nombre) return { error: 'El ' + n + ' tiene comprador. Primero libéralo.' };
    d.lista = lista.filter((x) => x !== n);
    delete d.numeros[n];
    return { guardar: true };
  });
  return r;
}

export async function guardarConfig(cfg) {
  return modificar((d) => { d.config = cfg; return { guardar: true }; });
}

/** Recorta y limpia un texto que escribió un visitante. */
export function texto(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
}

export function mensajeError(e) {
  if (e instanceof SinBaseDeDatos) return 'La página todavía no tiene su base de datos conectada.';
  const m = String((e && e.message) || '');
  if (/muchas personas|proteger los datos/.test(m)) return m;
  return 'No se pudo conectar con la base de datos. Intenta de nuevo en un momento.';
}

/** Lee el cuerpo JSON de la petición (Vercel ya lo convierte cuando llega como JSON). */
export function cuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}
