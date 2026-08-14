import React, { useState } from 'react';
import logo from './assets/logo.png';
import Login from './pantallas/Login.jsx';
import Productos from './pantallas/Productos.jsx';
import Vender from './pantallas/Vender.jsx';
import Historial from './pantallas/Historial.jsx';
import Caja from './pantallas/Caja.jsx';
import Usuarios from './pantallas/Usuarios.jsx';
import Clientes from './pantallas/Clientes.jsx';

export default function App() {
  const [usuarioActual, setUsuarioActual] = useState(null);
  const [pantallaActual, setPantallaActual] = useState('vender');

  if (!usuarioActual) {
    return <Login onLogin={setUsuarioActual} />;
  }

  const PANTALLAS = {
    vender: { label: 'Vender', componente: <Vender usuarioActual={usuarioActual} /> },
    productos: { label: 'Productos', componente: <Productos usuarioActual={usuarioActual} /> },
    historial: { label: 'Historial de ventas', componente: <Historial usuarioActual={usuarioActual} /> },
    clientes: { label: 'Clientes', componente: <Clientes usuarioActual={usuarioActual} /> },
    caja: { label: 'Caja', componente: <Caja usuarioActual={usuarioActual} /> },
    ...(usuarioActual.rol === 'admin'
      ? { usuarios: { label: 'Vendedores', componente: <Usuarios /> } }
      : {}),
  };

  const cerrarSesion = () => {
    setUsuarioActual(null);
    setPantallaActual('vender');
  };

  return (
    <div className="layout">
      <nav className="menu">
        <div>
          <div className="logo-badge">
            <img src={logo} alt="Almacén de Costura" />
          </div>
          {Object.entries(PANTALLAS).map(([key, { label }]) => (
            <button
              key={key}
              className={key === pantallaActual ? 'menu-item activo' : 'menu-item'}
              onClick={() => setPantallaActual(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div>
          <p style={{ fontSize: 13, opacity: 0.85, margin: '0 0 8px 0' }}>
            {usuarioActual.nombre} ({usuarioActual.rol})
          </p>
          <button className="menu-item" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </nav>
      <main className="contenido">{PANTALLAS[pantallaActual].componente}</main>
    </div>
  );
}
