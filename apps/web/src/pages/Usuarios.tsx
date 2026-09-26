import { useEffect, useState, type FormEvent } from 'react';
import type { CrearUsuarioInput, RolUsuario, UsuarioDTO } from '@erm2026/shared';
import { apiFetch, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

const ROL_LABEL: Record<RolUsuario, string> = {
  ADMIN: 'Administrador global',
  COORDINADOR: 'Coordinador',
  PERSONERO: 'Personero',
};

export default function Usuarios() {
  const { usuario: usuarioActual } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioDTO[] | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [mostrarModal, setMostrarModal] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  async function cargar() {
    const params = new URLSearchParams();
    if (busqueda) params.set('search', busqueda);
    if (filtroRol) params.set('rol', filtroRol);
    if (filtroEstado) params.set('estado', filtroEstado);
    try {
      const data = await apiFetch<UsuarioDTO[]>(`/api/usuarios?${params.toString()}`);
      setUsuarios(data);
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo cargar la lista de usuarios' });
    }
  }

  useEffect(() => {
    const t = setTimeout(cargar, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, filtroRol, filtroEstado]);

  async function revocar(u: UsuarioDTO) {
    try {
      await apiFetch(`/api/usuarios/${u.id}/${u.activo ? 'revocar' : 'reactivar'}`, { method: 'POST' });
      cargar();
    } catch (e) {
      setMensaje({ tipo: 'error', texto: e instanceof ApiError ? e.message : 'No se pudo actualizar el usuario' });
    }
  }

  const coordinadores = (usuarios ?? []).filter((u) => u.rol === 'COORDINADOR');

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Usuarios</h2>
          <p>Coordinadores y personeros de tu estructura</p>
        </div>
        <button className="btn" onClick={() => setMostrarModal(true)}>
          + Nuevo usuario
        </button>
      </div>

      {mensaje && <div className={`mensaje ${mensaje.tipo}`}>{mensaje.texto}</div>}

      <div className="card">
        <div className="toolbar">
          <div className="buscador">
            <input placeholder="Buscar por DNI, nombre o correo" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
            <option value="">Todos los roles</option>
            {usuarioActual?.rol === 'ADMIN' && <option value="ADMIN">Administrador global</option>}
            <option value="COORDINADOR">Coordinador</option>
            <option value="PERSONERO">Personero</option>
          </select>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>

        {usuarios && usuarios.length === 0 && <div className="vacio">No hay usuarios que coincidan con el filtro.</div>}

        {usuarios && usuarios.length > 0 && (
          <table className="tabla">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Rol</th>
                <th>Depende de</th>
                <th>Contacto</th>
                <th>Alta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.55 }}>
                  <td>
                    <strong>{u.nombre}</strong>
                    <div className="subtexto">DNI {u.dni}</div>
                  </td>
                  <td>
                    <span className={`badge-rol ${u.rol}`}>{ROL_LABEL[u.rol]}</span>
                  </td>
                  <td>{u.coordinadorNombre ?? '—'}</td>
                  <td>{u.email ?? u.telefono ?? '—'}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                  <td>
                    {u.id !== usuarioActual?.id && (
                      <button className={`btn pequeno ${u.activo ? 'peligro' : 'secundario'}`} onClick={() => revocar(u)}>
                        {u.activo ? 'Revocar' : 'Reactivar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mostrarModal && (
        <ModalNuevoUsuario
          coordinadores={coordinadores}
          soloPersonero={usuarioActual?.rol === 'COORDINADOR'}
          onCerrar={() => setMostrarModal(false)}
          onCreado={() => {
            setMostrarModal(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalNuevoUsuario({
  coordinadores,
  soloPersonero,
  onCerrar,
  onCreado,
}: {
  coordinadores: UsuarioDTO[];
  soloPersonero: boolean;
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [dni, setDni] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [rol, setRol] = useState<RolUsuario>('PERSONERO');
  const [coordinadorId, setCoordinadorId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (rol === 'PERSONERO' && !coordinadorId) {
      setError('Selecciona el coordinador del que depende este personero');
      return;
    }
    setGuardando(true);
    try {
      const input: CrearUsuarioInput = {
        nombre,
        dni,
        email: email || undefined,
        telefono: telefono || undefined,
        rol,
        password,
        coordinadorId: rol === 'PERSONERO' ? coordinadorId : undefined,
      };
      await apiFetch('/api/usuarios', { method: 'POST', body: JSON.stringify(input) });
      onCreado();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo crear el usuario');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nuevo usuario</h3>
          <button onClick={onCerrar}>×</button>
        </div>
        {error && <div className="mensaje error">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="form-row">
            <label>Nombre completo</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
          </div>
          <div className="form-grid">
            <div className="form-row">
              <label>DNI</label>
              <input value={dni} onChange={(e) => setDni(e.target.value)} required />
            </div>
            <div className="form-row">
              <label>Rol</label>
              <select value={rol} onChange={(e) => setRol(e.target.value as RolUsuario)} disabled={soloPersonero}>
                {!soloPersonero && <option value="ADMIN">Administrador global</option>}
                {!soloPersonero && <option value="COORDINADOR">Coordinador</option>}
                <option value="PERSONERO">Personero</option>
              </select>
            </div>
          </div>
          {rol === 'PERSONERO' && !soloPersonero && (
            <div className="form-row">
              <label>Coordinador del que depende</label>
              <select value={coordinadorId} onChange={(e) => setCoordinadorId(e.target.value)} required>
                <option value="">Selecciona…</option>
                {coordinadores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-grid">
            <div className="form-row">
              <label>Correo (opcional)</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Teléfono (opcional)</label>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <label>Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn secundario" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
