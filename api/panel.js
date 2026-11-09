// POST /api/panel  { clave, accion, ... }
// Acciones: datos | pagado | liberar | config | respaldo | agregar | registrar | quitar
// Solo responde con la clave del vendedor (variable de entorno CLAVE_PANEL en Vercel).
import {
  normalizarNumero, leerTodo, resumenPanel, guardarConfig, marcarPagado, liberarNumero, respaldar,
  agregarNumeros, registrarComprador, quitarNumero, texto, mensajeError, cuerpo
} from '../lib/db.js';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_RANGO = 200;

/** Lista de números a partir de { desde, hasta } o { numeros: [...] }. */
function numerosPedidos(b) {
  if (Array.isArray(b.numeros)) {
    const lista = b.numeros.slice(0, MAX_RANGO).map(normalizarNumero);
    if (lista.some((n) => !n)) return { error: 'Revisa los números: solo se aceptan cifras.' };
    return { lista };
  }
  const desde = normalizarNumero(b.desde);
  const hasta = b.hasta === undefined || String(b.hasta).trim() === '' ? desde : normalizarNumero(b.hasta);
  if (!desde || !hasta) return { error: 'Escribe el número con cifras, por ejemplo 0541.' };
  const a = Number(desde), z = Number(hasta);
  if (z < a) return { error: 'El número "hasta" debe ser mayor o igual que "desde".' };
  if (z - a + 1 > MAX_RANGO) return { error: 'Agrega máximo ' + MAX_RANGO + ' números a la vez.' };
  const ancho = Math.max(4, String(b.desde).trim().length);
  const lista = [];
  for (let i = a; i <= z; i++) lista.push(String(i).padStart(ancho, '0'));
  return { lista };
}

function persona(b) {
  const nombre = texto(b.nombre, 80);
  const celular = texto(b.celular, 20);
  if (nombre.length < 3) return { error: 'Escribe el nombre y apellido del comprador.' };
  if (celular && celular.replace(/\D/g, '').length < 7) return { error: 'Revisa el celular: debe tener al menos 7 cifras.' };
  return { datos: { nombre, celular, nota: texto(b.nota, 140) } };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Usa POST.' });

  const claveReal = String(process.env.CLAVE_PANEL || '').trim();
  if (!claveReal) {
    return res.status(200).json({ ok: false, error: 'Falta crear la variable CLAVE_PANEL en Vercel (Settings → Environment Variables).' });
  }
  const b = cuerpo(req);
  if (String(b.clave || '').trim() !== claveReal) {
    await esperar(800);
    return res.status(200).json({ ok: false, error: 'Clave incorrecta.' });
  }

  const responder = (r, extra) => {
    if (r && r.error) return res.status(200).json({ ok: false, error: r.error });
    return res.status(200).json({ ok: true, ...(extra || {}), ...resumenPanel(r.datos) });
  };

  try {
    const accion = b.accion || 'datos';
    if (accion === 'respaldo') return res.status(200).json(await respaldar());

    if (accion === 'agregar') {
      const p = numerosPedidos(b);
      if (p.error) return res.status(200).json({ ok: false, error: p.error });
      const r = await agregarNumeros(p.lista);
      return responder(r, { agregados: r.agregados || [], yaEstaban: r.yaEstaban || 0 });
    }

    const numero = normalizarNumero(b.numero);

    if (accion === 'registrar') {
      if (!numero) return res.status(200).json({ ok: false, error: 'Escribe el número con cifras, por ejemplo 0541.' });
      const p = persona(b);
      if (p.error) return res.status(200).json({ ok: false, error: p.error });
      const r = await registrarComprador(numero, p.datos, b.pagado === true);
      return responder(r, { numero, nuevo: !!r.nuevo });
    }

    if (accion === 'quitar') {
      if (!numero) return res.status(200).json({ ok: false, error: 'Número no válido.' });
      return responder(await quitarNumero(numero));
    }

    if (accion === 'pagado') {
      if (!numero) return res.status(200).json({ ok: false, error: 'Número no válido.' });
      const r = await marcarPagado(numero, b.pagado);
      if (!r.ok) return res.status(200).json({ ok: false, error: 'Ese número ya no tiene comprador.' });
      return responder(r);
    }

    if (accion === 'liberar') {
      if (!numero) return res.status(200).json({ ok: false, error: 'Número no válido.' });
      return responder(await liberarNumero(numero));
    }

    if (accion === 'config') {
      return responder(await guardarConfig({
        nombreVendedor: texto(b.nombreVendedor, 40),
        whatsappVendedor: texto(b.whatsappVendedor, 20).replace(/\D/g, '')
      }));
    }

    const t = await leerTodo();
    return res.status(200).json({ ok: true, numeros: t.numeros, filas: t.filas, config: t.config });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: mensajeError(e) });
  }
}
