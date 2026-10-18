// POST /api/apartar  { nums: ['0525'], nombre, celular, nota }
import { NUMEROS, texto, apartarNumeros, mensajeError, cuerpo } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Usa POST.' });

  const b = cuerpo(req);
  const nums = (Array.isArray(b.nums) ? b.nums : [])
    .map(String)
    .filter((n, i, a) => NUMEROS.includes(n) && a.indexOf(n) === i);
  const nombre = texto(b.nombre, 80);
  const celular = texto(b.celular, 20);
  const nota = texto(b.nota, 140);

  if (!nums.length) return res.status(200).json({ ok: false, error: 'Escoge al menos un número.' });
  if (nombre.length < 3) return res.status(200).json({ ok: false, error: 'Escribe tu nombre y apellido.' });
  if (celular.replace(/\D/g, '').length < 7) return res.status(200).json({ ok: false, error: 'Escribe un número de celular válido.' });

  try {
    const { tomados, vendidos } = await apartarNumeros(nums, { nombre, celular, nota });
    if (tomados.length) {
      return res.status(200).json({
        ok: false,
        tomados,
        vendidos,
        error: (tomados.length === 1
          ? 'El ' + tomados[0] + ' lo acaba de apartar otra persona.'
          : 'Los números ' + tomados.join(', ') + ' los acaba de apartar otra persona.') + ' Escoge otro.'
      });
    }
    return res.status(200).json({ ok: true, nums, vendidos });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: mensajeError(e) });
  }
}
