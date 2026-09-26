import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requiereAuth, requiereRol } from '../lib/auth';
import type { DashboardResumenDTO } from '@erm2026/shared';

export const dashboardRouter = Router();
dashboardRouter.use(requiereAuth, requiereRol('ADMIN', 'SUPERVISOR'));

dashboardRouter.get('/resumen', async (_req, res) => {
  const totalMesas = await prisma.mesa.count();
  const mesasDigitadas = await prisma.acta.count();

  const provincias = await prisma.provincia.findMany({
    include: {
      distritos: {
        include: { localesVotacion: { include: { mesas: { include: { acta: true } } } } },
      },
    },
  });

  const avancePorProvincia = provincias.map((p) => {
    const mesasDeProvincia = p.distritos.flatMap((d) => d.localesVotacion.flatMap((lv) => lv.mesas));
    return {
      provincia: p.nombre,
      totalMesas: mesasDeProvincia.length,
      mesasDigitadas: mesasDeProvincia.filter((m) => m.acta != null).length,
    };
  });

  const resultadosGobernador = await prisma.actaResultado.groupBy({
    by: ['listaCandidaturaId', 'tipo'],
    where: { cargo: 'GOBERNADOR_REGIONAL' },
    _sum: { votos: true },
  });

  const listasGobernador = await prisma.listaCandidatura.findMany({
    where: { cargo: 'GOBERNADOR_REGIONAL' },
    include: { organizacion: true },
  });
  const votosPorLista = new Map<string, number>();
  let totalBlancos = 0;
  let totalNulos = 0;
  let totalImpugnados = 0;

  for (const r of resultadosGobernador) {
    const votos = r._sum.votos ?? 0;
    if (r.tipo === 'VOTO_LISTA' && r.listaCandidaturaId) {
      votosPorLista.set(r.listaCandidaturaId, (votosPorLista.get(r.listaCandidaturaId) ?? 0) + votos);
    } else if (r.tipo === 'BLANCO') totalBlancos += votos;
    else if (r.tipo === 'NULO') totalNulos += votos;
    else if (r.tipo === 'IMPUGNADO') totalImpugnados += votos;
  }

  const resultadosGobernadorRegional = listasGobernador
    .map((l) => ({
      organizacion: l.organizacion.nombre,
      simboloUrl: l.organizacion.simboloUrl,
      votos: votosPorLista.get(l.id) ?? 0,
    }))
    .sort((a, b) => b.votos - a.votos);

  const dto: DashboardResumenDTO = {
    totalMesas,
    mesasDigitadas,
    porcentajeAvance: totalMesas > 0 ? Math.round((mesasDigitadas / totalMesas) * 1000) / 10 : 0,
    avancePorProvincia,
    resultadosGobernadorRegional,
    totalBlancos,
    totalNulos,
    totalImpugnados,
  };
  res.json(dto);
});
