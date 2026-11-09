// GET /api/estado → números de la rifa, vendidos (sin datos personales) y contacto del vendedor.
import { VALOR, leerTodo, mensajeError } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { numeros, vendidos, config } = await leerTodo();
    res.status(200).json({
      vendidos,
      config: { numeros, valor: VALOR, nombreVendedor: config.nombreVendedor, whatsappVendedor: config.whatsappVendedor }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: mensajeError(e) });
  }
}
