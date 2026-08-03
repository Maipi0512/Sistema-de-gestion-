import React, { useEffect, useState } from 'react';

const USUARIO_VACIO = { nombre: '', usuario: '', password: '', rol: 'vendedor' };

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState(USUARIO_VACIO);
  const [error, setError] = useState('');

  const cargar = () => window.api.usuarios.listar().then(setUsuarios);

  useEffect(() => {
    cargar();
  }, []);

  const handleCambio = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  const handleGuardar = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await window.api.usuarios.crear(form);
      setForm(USUARIO_VACIO);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2>Vendedores</h2>

      <form className="tarjeta" onSubmit={handleGuardar}>
        <h3>Nuevo vendedor</h3>
        {error && <p className="error">{error}</p>}
        <div className="fila-form">
          <label>
            Nombre *
            <input required value={form.nombre} onChange={handleCambio('nombre')} />
          </label>
          <label>
            Usuario (para iniciar sesión) *
            <input required value={form.usuario} onChange={handleCambio('usuario')} />
          </label>
        </div>
        <div className="fila-form">
          <label>
            Contraseña *
            <input required type="password" value={form.password} onChange={handleCambio('password')} />
          </label>
          <label>
            Rol
            <select value={form.rol} onChange={handleCambio('rol')}>
              <option value="vendedor">Vendedor</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
        </div>
        <button type="submit">Crear usuario</button>
      </form>

      <table className="tabla">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Usuario</th>
            <th>Rol</th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nombre}</td>
              <td>{u.usuario}</td>
              <td>{u.rol}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
