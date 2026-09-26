import { Link, useLocation } from 'react-router-dom';
import type { RolUsuario } from '@erm2026/shared';
import { IconChart, IconUsers, IconPin, IconEdit, IconClipboard, IconUserCheck, IconFile } from './Icons';

interface ItemNav {
  to: string;
  label: string;
  icono: (p: Record<string, never>) => JSX.Element;
  roles: RolUsuario[];
}

const ITEMS: ItemNav[] = [
  { to: '/resultados', label: 'Resultados', icono: IconChart, roles: ['ADMIN', 'COORDINADOR'] },
  { to: '/usuarios', label: 'Usuarios', icono: IconUsers, roles: ['ADMIN', 'COORDINADOR'] },
  { to: '/locales', label: 'Locales y mesas', icono: IconPin, roles: ['ADMIN', 'COORDINADOR'] },
  { to: '/asignacion', label: 'Asignación de mesas', icono: IconUserCheck, roles: ['ADMIN', 'COORDINADOR'] },
  { to: '/llenar-actas', label: 'Llenar actas', icono: IconEdit, roles: ['ADMIN', 'COORDINADOR', 'PERSONERO'] },
  { to: '/actas', label: 'Actas recibidas', icono: IconFile, roles: ['ADMIN', 'COORDINADOR'] },
];

export default function Sidebar({ rol }: { rol: RolUsuario }) {
  const location = useLocation();
  const items = ITEMS.filter((i) => i.roles.includes(rol));

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="icono">
          <IconClipboard />
        </span>
        Panel de Administrativos
      </div>
      <nav>
        {items.map((item) => {
          const Icono = item.icono;
          const activo = location.pathname === item.to;
          return (
            <Link key={item.to} to={item.to} className={activo ? 'activo' : ''}>
              <Icono />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
