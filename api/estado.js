// GET /api/estado → números vendidos (sin datos personales) y datos de contacto del vendedor.
import { NUMEROS, VALOR, vendidos, leerConfig, mensajeError } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const [lista, cfg] = await Promise.all([vendidos(), leerConfig()]);
    res.status(200).json({
      vendidos: lista,
      config: {
        numeros: NUMEROS,
        valor: VALOR,
        nombreVendedor: cfg.nombreVendedor || '',
        whatsappVendedor: cfg.whatsappVendedor || ''
      }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: mensajeError(e) });
  }
}
