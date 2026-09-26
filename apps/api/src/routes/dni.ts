import { Router } from 'express';
import { requiereAuth, requiereRol } from '../lib/auth';

export const dniRouter = Router();
dniRouter.use(requiereAuth, requiereRol('ADMIN', 'COORDINADOR'));

const DNI_API_TOKEN = process.env.DNI_API_TOKEN;

// Proxy hacia la API de consulta de DNI: el token vive solo en el servidor y
// nunca se expone al navegador. Se usa para autocompletar el nombre al crear
// un usuario nuevo.
dniRouter.get('/:dni', async (req, res) => {
  if (!DNI_API_TOKEN) {
    return res.status(503).json({ error: 'La consulta de DNI no está configurada en este servidor' });
  }
  const dni = req.params.dni;
  if (!/^\d{8}$/.test(dni)) {
    return res.status(400).json({ error: 'DNI inválido' });
  }

  try {
    const externa = await fetch(`https://api.migo.pe/api/v2/dni/${dni}`, {
      headers: { Authorization: `Bearer ${DNI_API_TOKEN}`, Accept: 'application/json' },
    });
    const body = (await externa.json()) as { success: boolean; dni?: string; nombre?: string };
    if (!externa.ok || !body.success) {
      return res.status(404).json({ error: 'No se encontró ese DNI' });
    }
    res.json({ dni: body.dni, nombre: body.nombre });
  } catch {
    res.status(502).json({ error: 'No se pudo consultar el servicio de DNI' });
  }
});
