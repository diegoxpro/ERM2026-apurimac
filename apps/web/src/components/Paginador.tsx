import { useEffect, useMemo, useState } from 'react';

// Paginación en el navegador para cualquier lista ya cargada. Vuelve a la
// primera página cuando cambia el tamaño de la lista (al filtrar o buscar);
// si solo se recarga (p. ej. tras guardar un acta) se queda en la misma página.
export function usePaginacion<T>(items: T[] | null | undefined, porPagina = 20) {
  const lista = items ?? [];
  const [pagina, setPagina] = useState(0);
  const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina));

  useEffect(() => {
    setPagina(0);
  }, [lista.length]);

  // Si la lista se achica (p. ej. se borró un elemento), no quedarse en una página vacía.
  const actual = Math.min(pagina, totalPaginas - 1);
  const visibles = useMemo(() => lista.slice(actual * porPagina, (actual + 1) * porPagina), [lista, actual, porPagina]);

  return { visibles, pagina: actual, setPagina, total: lista.length, porPagina, totalPaginas };
}

export default function Paginador({
  pagina,
  setPagina,
  total,
  porPagina,
  totalPaginas,
}: {
  pagina: number;
  setPagina: (p: number) => void;
  total: number;
  porPagina: number;
  totalPaginas: number;
}) {
  if (total <= porPagina) return null;
  const desde = pagina * porPagina + 1;
  const hasta = Math.min((pagina + 1) * porPagina, total);
  return (
    <div className="paginacion">
      <span className="subtexto">
        {desde}–{hasta} de {total} · página {pagina + 1} de {totalPaginas}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn pequeno secundario" disabled={pagina === 0} onClick={() => setPagina(0)} title="Primera página">
          «
        </button>
        <button type="button" className="btn pequeno secundario" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>
          Anterior
        </button>
        <button type="button" className="btn pequeno secundario" disabled={pagina >= totalPaginas - 1} onClick={() => setPagina(pagina + 1)}>
          Siguiente
        </button>
        <button
          type="button"
          className="btn pequeno secundario"
          disabled={pagina >= totalPaginas - 1}
          onClick={() => setPagina(totalPaginas - 1)}
          title="Última página"
        >
          »
        </button>
      </div>
    </div>
  );
}
