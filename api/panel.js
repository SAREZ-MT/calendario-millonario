// POST /api/panel  { clave, accion: 'datos' | 'pagado' | 'liberar' | 'config' | 'respaldo', ... }
// Solo responde con la clave del vendedor (variable de entorno CLAVE_PANEL en Vercel).
import {
  NUMEROS, leerTodo, guardarConfig, marcarPagado, liberarNumero, respaldar,
  texto, mensajeError, cuerpo
} from '../lib/db.js';

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

  try {
    if (b.accion === 'respaldo') return res.status(200).json(await respaldar());
    const numero = String(b.numero || '');
    if (b.accion === 'pagado') {
      if (!NUMEROS.includes(numero)) return res.status(200).json({ ok: false, error: 'Número no válido.' });
      if (!(await marcarPagado(numero, b.pagado))) return res.status(200).json({ ok: false, error: 'Ese número ya no tiene comprador.' });
    } else if (b.accion === 'liberar') {
      if (!NUMEROS.includes(numero)) return res.status(200).json({ ok: false, error: 'Número no válido.' });
      await liberarNumero(numero);
    } else if (b.accion === 'config') {
      await guardarConfig({
        nombreVendedor: texto(b.nombreVendedor, 40),
        whatsappVendedor: texto(b.whatsappVendedor, 20).replace(/\D/g, '')
      });
    }
    const { filas, config } = await leerTodo();
    return res.status(200).json({ ok: true, filas, config });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: mensajeError(e) });
  }
}
