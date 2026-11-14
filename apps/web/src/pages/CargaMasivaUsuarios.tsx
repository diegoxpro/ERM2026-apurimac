import { useRef, useState } from 'react';
import type { FilaImportacionDTO, ResultadoImportacionDTO, RolUsuario } from '@erm2026/shared';
import { apiFetch, ApiError } from '../lib/api';
import { IconClose } from '../components/Icons';

const ROL_LABEL: Record<RolUsuario, string> = {
  ADMIN: 'Administrador',
  COORDINADOR: 'Coordinador',
  PERSONERO: 'Personero',
};

const ACCION_LABEL: Record<FilaImportacionDTO['accion'], string> = {
  crear: 'Nuevo',
  actualizar: 'Actualizar',
  error: 'Con error',
};

function leerBase64(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '');
    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

function descargarCredenciales(credenciales: ResultadoImportacionDTO['credenciales']) {
  const filas = [['DNI', 'Nombre', 'Rol', 'Contraseña temporal'], ...credenciales.map((c) => [c.dni, c.nombre, ROL_LABEL[c.rol], c.password])];
  const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'credenciales-temporales.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function ModalCargaMasiva({ onCerrar }: { onCerrar: () => void }) {
  const [archivo, setArchivo] = useState<{ nombre: string; base64: string } | null>(null);
  const [filas, setFilas] = useState<FilaImportacionDTO[] | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionDTO | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(null);
    setFilas(null);
    setProcesando(true);
    try {
      const base64 = await leerBase64(f);
      setArchivo({ nombre: f.name, base64 });
      const r = await apiFetch<{ filas: FilaImportacionDTO[] }>('/api/usuarios/importar', {
        method: 'POST',
        body: JSON.stringify({ archivoBase64: base64, confirmar: false }),
      });
      setFilas(r.filas);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo leer el archivo');
    } finally {
      setProcesando(false);
    }
  }

  async function importar() {
    if (!archivo) return;
    setError(null);
    setProcesando(true);
    try {
      const r = await apiFetch<{ filas: FilaImportacionDTO[]; resultado: ResultadoImportacionDTO }>('/api/usuarios/importar', {
        method: 'POST',
        body: JSON.stringify({ archivoBase64: archivo.base64, confirmar: true }),
      });
      setFilas(r.filas);
      setResultado(r.resultado);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo completar la importación');
    } finally {
      setProcesando(false);
    }
  }

  const conError = filas?.filter((f) => f.accion === 'error').length ?? 0;
  const nuevos = filas?.filter((f) => f.accion === 'crear').length ?? 0;
  const actualizar = filas?.filter((f) => f.accion === 'actualizar').length ?? 0;
  const visibles = (filas ?? []).filter((f) => !soloErrores || f.accion === 'error');

  return (
    <div className="modal-fondo">
      <div className="modal muy-ancho" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Carga masiva de usuarios</h3>
            <p>Registra personeros, coordinadores y administradores desde un Excel</p>
          </div>
          <button onClick={onCerrar} disabled={procesando}>
            <IconClose />
          </button>
        </div>

        {error && <div className="mensaje error">{error}</div>}

        {resultado ? (
          <>
            <div className="mensaje exito">
              Importación completada: {resultado.creados} nuevos, {resultado.actualizados} actualizados
              {resultado.mesasAsignadas > 0 && `, ${resultado.mesasAsignadas} mesas asignadas`}
              {resultado.omitidos > 0 && ` · ${resultado.omitidos} filas con error omitidas`}.
            </div>
            {resultado.credenciales.length > 0 && (
              <div className="card" style={{ marginBottom: 0 }}>
                <strong>Contraseñas temporales</strong>
                <p className="subtexto" style={{ margin: '4px 0 10px' }}>
                  Para los administradores y coordinadores nuevos. Se muestran <strong>solo esta vez</strong>: descárgalas
                  ahora y entrégalas a cada persona. Los personeros no necesitan contraseña.
                </p>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>DNI</th>
                      <th>Nombre</th>
                      <th>Rol</th>
                      <th>Contraseña temporal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.credenciales.map((c) => (
                      <tr key={c.dni}>
                        <td>{c.dni}</td>
                        <td>{c.nombre}</td>
                        <td>{ROL_LABEL[c.rol]}</td>
                        <td>
                          <code>{c.password}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button className="btn" style={{ marginTop: 12 }} onClick={() => descargarCredenciales(resultado.credenciales)}>
                  Descargar contraseñas (CSV)
                </button>
              </div>
            )}
            <div className="modal-footer">
              <button className="btn" onClick={onCerrar}>
                Listo
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="carga-pasos">
              <div>
                <strong>1.</strong> Descarga la{' '}
                <a href="/plantilla-carga-usuarios.xlsx" download>
                  plantilla de Excel
                </a>{' '}
                y llénala: un usuario por fila.
                <ul className="subtexto">
                  <li>
                    <strong>Rol:</strong> Administrador, Coordinador o Personero.
                  </li>
                  <li>
                    <strong>Depende de:</strong> para personeros, el DNI (o nombre exacto) de su coordinador. Puede ser un coordinador
                    del mismo archivo.
                  </li>
                  <li>
                    <strong>Mesas asignadas:</strong> números de mesa separados por coma, p. ej. <code>032242, 032243</code>.
                  </li>
                  <li>Si un DNI ya existe, se actualizan sus datos en lugar de duplicarlo.</li>
                </ul>
              </div>
              <div>
                <strong>2.</strong> Sube el archivo; primero verás una vista previa y nada se guarda hasta que confirmes.
                <div style={{ marginTop: 8 }}>
                  <button className="btn secundario" onClick={() => inputRef.current?.click()} disabled={procesando}>
                    {procesando && !filas ? 'Leyendo…' : archivo ? 'Elegir otro archivo' : 'Elegir archivo Excel'}
                  </button>
                  {archivo && <span className="subtexto" style={{ marginLeft: 10 }}>{archivo.nombre}</span>}
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    style={{ display: 'none' }}
                    onChange={elegir}
                  />
                </div>
              </div>
            </div>

            {filas && (
              <>
                <div className="resumen-carga">
                  <span className="badge-estado VALIDADA">{nuevos} nuevos</span>
                  <span className="badge-estado ENVIADA">{actualizar} a actualizar</span>
                  <span className={`badge-estado ${conError ? 'OBSERVADA' : 'SIN_REGISTRAR'}`}>{conError} con error</span>
                  {conError > 0 && (
                    <label className="subtexto" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', margin: 0, fontWeight: 500 }}>
                      <input type="checkbox" checked={soloErrores} onChange={(e) => setSoloErrores(e.target.checked)} style={{ width: 'auto' }} />
                      Ver solo filas con error
                    </label>
                  )}
                </div>
                <div className="tabla-scroll">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th>Fila</th>
                        <th>DNI</th>
                        <th>Nombre</th>
                        <th>Rol</th>
                        <th>Depende de</th>
                        <th>Mesas</th>
                        <th>Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((f) => (
                        <tr key={f.fila} className={f.accion === 'error' ? 'fila-error' : ''}>
                          <td>{f.fila}</td>
                          <td>{f.dni || '—'}</td>
                          <td>{f.nombre || '—'}</td>
                          <td>{f.rol ? ROL_LABEL[f.rol] : '—'}</td>
                          <td>{f.dependeDe || '—'}</td>
                          <td>{f.mesas.length ? f.mesas.join(', ') : '—'}</td>
                          <td>
                            <span className={`badge-accion ${f.accion}`}>{ACCION_LABEL[f.accion]}</span>
                            {f.errores.map((m) => (
                              <div key={m} className="nota-error">
                                {m}
                              </div>
                            ))}
                            {f.avisos.map((m) => (
                              <div key={m} className="nota-aviso">
                                {m}
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="modal-footer">
              <button className="btn secundario" onClick={onCerrar} disabled={procesando}>
                Cancelar
              </button>
              {filas && (
                <button className="btn" onClick={importar} disabled={procesando || nuevos + actualizar === 0}>
                  {procesando
                    ? 'Importando…'
                    : `Importar ${nuevos + actualizar} usuario${nuevos + actualizar === 1 ? '' : 's'}${conError ? ` (omitir ${conError} con error)` : ''}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
