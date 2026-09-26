import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requiereAuth, requiereRol } from '../lib/auth';
import type { ResultadosResumenDTO, ResultadosPorCargoDTO, Cargo } from '@erm2026/shared';

export const resultadosRouter = Router();
resultadosRouter.use(requiereAuth, requiereRol('ADMIN', 'COORDINADOR'));

const CARGOS: { cargo: Cargo; titulo: string }[] = [
  { cargo: 'GOBERNADOR_REGIONAL', titulo: 'Gobernador y Vicegobernador Regional' },
  { cargo: 'CONSEJERO_REGIONAL', titulo: 'Consejero Regional' },
  { cargo: 'ALCALDE_PROVINCIAL', titulo: 'Alcalde Provincial' },
  { cargo: 'ALCALDE_DISTRITAL', titulo: 'Alcalde Distrital' },
];

resultadosRouter.get('/', async (req, res) => {
  const provincia = req.query.provincia ? String(req.query.provincia) : undefined;

  const mesaWhere: any = {};
  if (provincia) mesaWhere.localVotacion = { distrito: { provincia: { nombre: provincia } } };

  const actaWhere: any = { mesa: mesaWhere };

  const [mesasConProvincia, actasRecibidas, validadas, personerosActivos] = await Promise.all([
    prisma.mesa.findMany({
      where: mesaWhere,
      select: { id: true, localVotacion: { select: { distrito: { select: { capitalDeProvincia: true } } } } },
    }),
    prisma.acta.count({ where: actaWhere }),
    prisma.acta.count({ where: { ...actaWhere, estado: 'VALIDADA' } }),
    prisma.usuario.count({ where: { rol: 'PERSONERO', activo: true } }),
  ]);

  const actasEsperadas = mesasConProvincia.reduce(
    (acc, m) => acc + (m.localVotacion.distrito.capitalDeProvincia ? 3 : 4),
    0
  );

  const mesasCubiertasRows = await prisma.acta.findMany({ where: actaWhere, select: { mesaId: true }, distinct: ['mesaId'] });

  const provincias = await prisma.provincia.findMany({
    include: { distritos: { include: { localesVotacion: { include: { mesas: { include: { actas: true } } } } } } },
  });
  const avancePorProvincia = provincias.map((p) => {
    const mesas = p.distritos.flatMap((d) => d.localesVotacion.flatMap((lv) => lv.mesas));
    return {
      provincia: p.nombre,
      totalMesas: mesas.length,
      mesasDigitadas: mesas.filter((m) => m.actas.length > 0).length,
    };
  });

  const porCargo: ResultadosPorCargoDTO[] = [];
  for (const { cargo, titulo } of CARGOS) {
    const resultados = await prisma.actaResultado.findMany({
      where: { acta: { cargo, ...actaWhere } },
      include: { listaCandidatura: { include: { organizacion: true } } },
    });

    const votosPorOrg = new Map<string, { simboloUrl: string | null; votos: number }>();
    let blancos = 0;
    let nulos = 0;
    let impugnados = 0;
    let validos = 0;

    for (const r of resultados) {
      if (r.tipo === 'VOTO_LISTA' && r.listaCandidatura) {
        const nombre = r.listaCandidatura.organizacion.nombre;
        const actual = votosPorOrg.get(nombre) ?? { simboloUrl: r.listaCandidatura.organizacion.simboloUrl, votos: 0 };
        actual.votos += r.votos;
        votosPorOrg.set(nombre, actual);
        validos += r.votos;
      } else if (r.tipo === 'BLANCO') blancos += r.votos;
      else if (r.tipo === 'NULO') nulos += r.votos;
      else if (r.tipo === 'IMPUGNADO') impugnados += r.votos;
    }

    const totalEmitidos = validos + blancos + nulos + impugnados;
    const organizaciones = [...votosPorOrg.entries()]
      .map(([organizacion, v]) => ({
        organizacion,
        simboloUrl: v.simboloUrl,
        votos: v.votos,
        porcentaje: totalEmitidos > 0 ? Math.round((v.votos / totalEmitidos) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.votos - a.votos);

    porCargo.push({ cargo, titulo, organizaciones, validos, blancos, nulos, impugnados });
  }

  const dto: ResultadosResumenDTO = {
    actasRecibidas,
    actasEsperadas,
    validadas,
    mesasCubiertas: mesasCubiertasRows.length,
    personerosActivos,
    incidencias: 0,
    incidenciasAltas: 0,
    avancePorProvincia,
    porCargo,
  };
  res.json(dto);
});
