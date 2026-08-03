import React, { useState } from 'react';
import logo from '../assets/logo.png';

export default function Login({ onLogin }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const usuarioLogueado = await window.api.auth.login(usuario, password);
      onLogin(usuarioLogueado);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--color-bg)' }}>
      <form onSubmit={handleSubmit} className="tarjeta" style={{ width: 320 }}>
        <img src={logo} alt="Almacén de Costura" style={{ width: '100%', maxWidth: 220, display: 'block', margin: '0 auto 16px' }} />
        <label>
          Usuario
          <input required value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus />
        </label>
        <label>
          Contraseña
          <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={cargando} style={{ width: '100%' }}>
          {cargando ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
