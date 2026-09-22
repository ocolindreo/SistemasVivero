-- Ejecutar una sola vez sobre una base de datos existente.
ALTER TABLE usu_usuarios
  ADD COLUMN usu_intentos_fallidos TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER usu_fecha_ultimo_login,
  ADD COLUMN usu_fecha_ultimo_intento_fallido DATETIME NULL AFTER usu_intentos_fallidos,
  ADD COLUMN usu_bloqueado_hasta DATETIME NULL AFTER usu_fecha_ultimo_intento_fallido,
  ADD COLUMN usu_bloqueo_administrativo TINYINT(1) NOT NULL DEFAULT 0 AFTER usu_bloqueado_hasta,
  ADD COLUMN usu_fecha_desbloqueo DATETIME NULL AFTER usu_bloqueo_administrativo,
  ADD COLUMN usu_id_usuario_desbloqueo INT NULL AFTER usu_fecha_desbloqueo,
  ADD CONSTRAINT fk_usu_desbloqueador
    FOREIGN KEY (usu_id_usuario_desbloqueo) REFERENCES usu_usuarios(usu_id);
