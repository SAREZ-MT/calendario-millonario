// GET /api/estado → números vendidos (sin datos personales) y datos de contacto del vendedor.
import { NUMEROS, VALOR, leerTodo, mensajeError } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { vendidos, config } = await leerTodo();
    res.status(200).json({
      vendidos,
      config: { numeros: NUMEROS, valor: VALOR, nombreVendedor: config.nombreVendedor, whatsappVendedor: config.whatsappVendedor }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: mensajeError(e) });
  }
}
