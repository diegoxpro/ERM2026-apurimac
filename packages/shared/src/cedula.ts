import type { Cargo, CedulaMesaDTO, ColumnaCedulaDTO, Vuelta } from './index';

export interface MesaCatalogoItem {
  id: string;
  codigo: string;
  electores: number;
  localVotacion: string;
  distrito: string;
  provincia: string;
  capitalDeProvincia: boolean;
}

export interface ListaCatalogoItem {
  id: string;
  cargo: Cargo;
  organizacion: string;
  simboloUrl: string | null;
  orden: number;
  provinciaNombre: string; // "" si no aplica (alcance regional)
  distritoNombre: string; // "" si no aplica (alcance regional o provincial)
  vuelta?: Vuelta; // ausente en catálogos cacheados antes de la segunda vuelta = PRIMERA
}

export interface CatalogoDTO {
  vuelta?: Vuelta; // vuelta activa al descargar el catálogo (ausente = PRIMERA)
  mesas: MesaCatalogoItem[];
  listas: ListaCatalogoItem[];
}

/**
 * Reconstruye las columnas de la cédula de una mesa a partir del catálogo completo
 * de listas de candidatura. Misma regla en backend y frontend: los distritos que
 * son capital de provincia no tienen columna de Alcalde Distrital (esa función la
 * cumple el Alcalde Provincial), tal como aparece en la cédula física del JNE.
 */
export function construirColumnasCedula(
  mesa: MesaCatalogoItem,
  listasCatalogo: ListaCatalogoItem[],
  vuelta: Vuelta = 'PRIMERA'
): ColumnaCedulaDTO[] {
  const columnas: ColumnaCedulaDTO[] = [];
  const listas = listasCatalogo.filter((l) => (l.vuelta ?? 'PRIMERA') === vuelta);

  // Segunda vuelta: una sola columna, Gobernador y Vicegobernador Regional,
  // con las dos fórmulas que pasaron (mismas para todas las mesas de la región).
  if (vuelta === 'SEGUNDA') {
    const listasCol = listas
      .filter((l) => l.cargo === 'GOBERNADOR_REGIONAL')
      .sort((a, b) => a.orden - b.orden)
      .map((l) => ({ id: l.id, cargo: l.cargo, organizacion: l.organizacion, simboloUrl: l.simboloUrl, orden: l.orden }));
    return [
      {
        cargo: 'GOBERNADOR_REGIONAL',
        titulo: 'SEGUNDA ELECCIÓN REGIONAL - GOBERNADOR Y VICEGOBERNADOR REGIONAL',
        listas: listasCol,
        estado: 'SIN_REGISTRAR',
        actaId: null,
      },
    ];
  }

  const porCargo: { cargo: Cargo; titulo: string; filtro: (l: ListaCatalogoItem) => boolean }[] = [
    {
      cargo: 'GOBERNADOR_REGIONAL',
      titulo: 'GOBERNADOR Y VICEGOBERNADOR REGIONAL',
      filtro: (l) => l.cargo === 'GOBERNADOR_REGIONAL',
    },
    {
      cargo: 'CONSEJERO_REGIONAL',
      titulo: `CONSEJERO REGIONAL PROVINCIA DE ${mesa.provincia}`,
      filtro: (l) => l.cargo === 'CONSEJERO_REGIONAL' && l.provinciaNombre === mesa.provincia,
    },
    {
      cargo: 'ALCALDE_PROVINCIAL',
      titulo: `PROVINCIA DE ${mesa.provincia}`,
      filtro: (l) => l.cargo === 'ALCALDE_PROVINCIAL' && l.provinciaNombre === mesa.provincia,
    },
  ];

  if (!mesa.capitalDeProvincia) {
    porCargo.push({
      cargo: 'ALCALDE_DISTRITAL',
      titulo: `DISTRITO DE ${mesa.distrito}`,
      filtro: (l) => l.cargo === 'ALCALDE_DISTRITAL' && l.distritoNombre === mesa.distrito && l.provinciaNombre === mesa.provincia,
    });
  }

  for (const def of porCargo) {
    const listasCol = listas
      .filter(def.filtro)
      .sort((a, b) => a.orden - b.orden)
      .map((l) => ({ id: l.id, cargo: def.cargo, organizacion: l.organizacion, simboloUrl: l.simboloUrl, orden: l.orden }));
    columnas.push({ cargo: def.cargo, titulo: def.titulo, listas: listasCol, estado: 'SIN_REGISTRAR', actaId: null });
  }

  return columnas;
}

/** Cuántas actas (una por cargo) se esperan de una mesa en la vuelta indicada. */
export function actasEsperadasPorMesa(capitalDeProvincia: boolean, vuelta: Vuelta = 'PRIMERA'): number {
  if (vuelta === 'SEGUNDA') return 1;
  return capitalDeProvincia ? 3 : 4;
}

export function construirCedulaMesa(mesa: MesaCatalogoItem, listas: ListaCatalogoItem[], vuelta: Vuelta = 'PRIMERA'): CedulaMesaDTO {
  return {
    mesaId: mesa.id,
    mesaCodigo: mesa.codigo,
    provincia: mesa.provincia,
    distrito: mesa.distrito,
    localVotacion: mesa.localVotacion,
    electoresHabiles: mesa.electores,
    vuelta,
    columnas: construirColumnasCedula(mesa, listas, vuelta),
  };
}
