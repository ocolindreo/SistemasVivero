import { useEffect, useMemo, useState } from 'react'
import Modal from '../../components/Modal'
import ConfirmDialog from '../../components/ConfirmDialog'
import StatusBadge from '../../components/StatusBadge'
import { crearUsuario, editarUsuario, obtenerRoles, obtenerUsuarios, inactivarUsuario, reactivarUsuario } from '../../services/api'

const emptyForm = { username: '', email: '', nombres: '', apellidos: '', telefono: '', rol_id: '', password: '' }

function UsuarioForm({ usuario, roles, saving, onSave, onClose, currentUserId }) {
  const [form, setForm] = useState(usuario ? { ...usuario, rol_id: usuario.rol.id, password: '' } : emptyForm)
  const ownRole = usuario?.id === currentUserId
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = (event) => { event.preventDefault(); onSave(form) }
  return <form className="user-form" onSubmit={submit}>
    <div className="form-grid">
      {['username', 'email', 'nombres', 'apellidos', 'telefono'].map((field) => <label key={field}>{field === 'telefono' ? 'Teléfono' : field[0].toUpperCase() + field.slice(1)}<input name={field} value={form[field] || ''} onChange={update} required={field !== 'telefono'} /></label>)}
      {!usuario && <label>Contraseña<input type="password" name="password" value={form.password} onChange={update} minLength="8" required /></label>}
      <label>Rol<select name="rol_id" value={form.rol_id} onChange={update} disabled={ownRole} required><option value="">Seleccione un rol</option>{roles.map((role) => <option value={role.id} key={role.id}>{role.nombre}</option>)}</select></label>
    </div>
    {ownRole && <p className="form-help">No puede cambiar su propio rol.</p>}
    <div className="modal-actions"><button className="button-secondary" type="button" onClick={onClose}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button></div>
  </form>
}

function UsuariosView({ currentUser, onToast, onSessionInvalid }) {
  const [users, setUsers] = useState([]); const [roles, setRoles] = useState([]); const [search, setSearch] = useState(''); const [modal, setModal] = useState(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const [confirmDialog, setConfirmDialog] = useState(null)
  const load = async () => { try { setLoading(true); const [usersData, rolesData] = await Promise.all([obtenerUsuarios(), obtenerRoles()]); setUsers(usersData.usuarios); setRoles(rolesData.roles) } catch (error) { setMessage(error.message) } finally { setLoading(false) } }
  useEffect(() => {
    let active = true
    Promise.all([obtenerUsuarios(), obtenerRoles()])
      .then(([usersData, rolesData]) => {
        if (active) { setUsers(usersData.usuarios); setRoles(rolesData.roles) }
      })
      .catch((error) => { if (active) setMessage(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const filtered = useMemo(() => users.filter((user) => `${user.username} ${user.nombres} ${user.apellidos} ${user.email}`.toLowerCase().includes(search.toLowerCase())), [users, search])
  const save = async (data) => { try { setSaving(true); if (modal.user) { const { username, email, nombres, apellidos, telefono, rol_id } = data; await editarUsuario(modal.user.id, { username, email, nombres, apellidos, telefono, rol_id: Number(rol_id) }); onToast('Usuario actualizado correctamente', 'success') } else { await crearUsuario({ ...data, rol_id: Number(data.rol_id) }); onToast('Usuario creado correctamente', 'success') } setModal(null); await load() } catch (error) { if (error.status === 401 || error.status === 403) onSessionInvalid(); else onToast(error.message, 'error') } finally { setSaving(false) } }
  const changeStatus = (user) => setConfirmDialog({ user, action: user.estado ? inactivarUsuario : reactivarUsuario, title: user.estado ? 'Inactivar usuario' : 'Reactivar usuario', message: `¿Desea ${user.estado ? 'inactivar' : 'reactivar'} al usuario ${user.username}?`, confirmLabel: user.estado ? 'Inactivar' : 'Reactivar', danger: user.estado })
  const confirmStatus = async () => { const { user, action } = confirmDialog; setConfirmDialog((current) => ({ ...current, loading: true })); try { await action(user.id); setConfirmDialog(null); await load(); onToast(`Usuario ${user.estado ? 'inactivado' : 'reactivado'} correctamente`, 'success') } catch (error) { setConfirmDialog(null); if (error.status === 401 || error.status === 403) onSessionInvalid(); else onToast(error.message, 'error') } }
  return <section className="users-view" aria-labelledby="users-title">
    <div className="users-header"><div><span className="page-kicker">Seguridad y Usuarios</span><h1 id="users-title">Usuarios</h1><p>Administración de usuarios y accesos del sistema.</p></div>{currentUser.rol.codigo === 'ADMIN' && <button onClick={() => setModal({ user: null })}>+ Nuevo Usuario</button>}</div>
    {message && <p className="users-alert">{message}</p>}
    {currentUser.rol.codigo !== 'ADMIN' ? <div className="empty-state">No tiene permisos para administrar usuarios.</div> : <><input className="user-search" placeholder="Buscar por usuario, nombre o correo" value={search} onChange={(event) => setSearch(event.target.value)} />{loading ? <div className="empty-state">Cargando usuarios...</div> : filtered.length === 0 ? <div className="empty-state">{users.length ? 'No hay resultados para la búsqueda.' : 'No hay usuarios registrados.'}</div> : <div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id}><td>{user.username}</td><td>{user.nombres} {user.apellidos}</td><td>{user.email}</td><td>{user.rol.nombre}</td><td><StatusBadge active={user.estado === 1} /></td><td className="row-actions"><button className="text-button" onClick={() => setModal({ user })}>Editar</button>{user.id === currentUser.id ? <span className="action-note">No puede inactivarse</span> : <button className="text-button" onClick={() => changeStatus(user)}>{user.estado ? 'Inactivar' : 'Reactivar'}</button>}</td></tr>)}</tbody></table></div>}</>}
    {modal && <Modal title={modal.user ? 'Editar usuario' : 'Nuevo usuario'} onClose={() => setModal(null)}><UsuarioForm usuario={modal.user} roles={roles} saving={saving} onSave={save} onClose={() => setModal(null)} currentUserId={currentUser.id} /></Modal>}
    <ConfirmDialog dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} onConfirm={confirmStatus} />
  </section>
}
export default UsuariosView
