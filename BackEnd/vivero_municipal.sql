-- ========================================================
-- SISTEMA VIVERO MUNICIPAL - SCRIPT DE BASE DE DATOS
-- Version: 1.0 - DER v1.0 APROBADO
-- Fecha: 2026-08-14
-- ========================================================

-- FASE 0: CREAR/USAR BASE DE DATOS
-- ========================================================
CREATE DATABASE IF NOT EXISTS vivero_municipal
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE vivero_municipal;

-- ========================================================
-- FASE 1: SEGURIDAD BASE
-- ========================================================

-- 01. TABLA: ROL_ROLES (Roles del sistema)
-- ========================================================
CREATE TABLE IF NOT EXISTS rol_roles (
    rol_id INT AUTO_INCREMENT PRIMARY KEY,
    rol_codigo VARCHAR(50) NOT NULL UNIQUE,
    rol_nombre VARCHAR(100) NOT NULL,
    rol_descripcion VARCHAR(255) NOT NULL,
    rol_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activo, 0=Inactivo',
    rol_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rol_id_usuario_creacion INT,
    rol_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    rol_id_usuario_modificacion INT,
    
    INDEX idx_rol_estado (rol_estado),
    INDEX idx_rol_codigo (rol_codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 02. TABLA: USU_USUARIOS (Usuarios del sistema)
-- ========================================================
CREATE TABLE IF NOT EXISTS usu_usuarios (
    usu_id INT AUTO_INCREMENT PRIMARY KEY,
    usu_username VARCHAR(100) NOT NULL UNIQUE,
    usu_email VARCHAR(150) NOT NULL UNIQUE,
    usu_password VARCHAR(255) NOT NULL,
    usu_nombres VARCHAR(100) NOT NULL,
    usu_apellidos VARCHAR(100) NOT NULL,
    usu_telefono VARCHAR(20),
    usu_id_rol INT NOT NULL,
    usu_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activo, 0=Inactivo',
    usu_fecha_ultimo_login DATETIME,
    usu_fecha_inactivacion DATETIME,
    usu_id_usuario_inactivacion INT,
    usu_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usu_id_usuario_creacion INT,
    usu_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    usu_id_usuario_modificacion INT,
    
    CONSTRAINT fk_usu_rol FOREIGN KEY (usu_id_rol) REFERENCES rol_roles(rol_id),
    
    INDEX idx_usu_estado (usu_estado),
    INDEX idx_usu_username (usu_username),
    INDEX idx_usu_email (usu_email),
    INDEX idx_usu_id_rol (usu_id_rol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agregar FK de usuario creador/modificador después de creación de tabla
ALTER TABLE usu_usuarios 
ADD CONSTRAINT fk_usu_creador FOREIGN KEY (usu_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
ADD CONSTRAINT fk_usu_modificador FOREIGN KEY (usu_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
ADD CONSTRAINT fk_usu_inactivador FOREIGN KEY (usu_id_usuario_inactivacion) REFERENCES usu_usuarios(usu_id);

-- Agregar FK a rol_roles para usuario creador/modificador
ALTER TABLE rol_roles 
ADD CONSTRAINT fk_rol_usuario_creacion FOREIGN KEY (rol_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
ADD CONSTRAINT fk_rol_usuario_modificacion FOREIGN KEY (rol_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id);

-- 03. TABLA: AUD_AUDITORIAS (Historial de operaciones)
-- ========================================================
CREATE TABLE IF NOT EXISTS aud_auditorias (
    aud_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    aud_id_usuario INT,
    aud_accion VARCHAR(30) NOT NULL COMMENT 'LOGIN, LOGOUT, INSERT, UPDATE, INACTIVAR, REACTIVAR, APROBAR, RECHAZAR, CANCELAR, ENTREGAR, etc.',
    aud_tabla VARCHAR(100),
    aud_id_registro INT,
    aud_datos_anteriores JSON,
    aud_datos_nuevos JSON,
    aud_ip VARCHAR(45),
    aud_navegador VARCHAR(255),
    aud_fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    aud_observacion TEXT,
    
    CONSTRAINT fk_aud_usuario FOREIGN KEY (aud_id_usuario) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_aud_tabla (aud_tabla),
    INDEX idx_aud_usuario (aud_id_usuario),
    INDEX idx_aud_accion (aud_accion),
    INDEX idx_aud_fecha (aud_fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- FASE 2: CATÁLOGOS
-- ========================================================

-- 04. TABLA: EST_ESTADOS (Estados centralizados)
-- ========================================================
CREATE TABLE IF NOT EXISTS est_estados (
    est_id INT AUTO_INCREMENT PRIMARY KEY,
    est_codigo VARCHAR(50) NOT NULL,
    est_descripcion VARCHAR(255) NOT NULL,
    est_modulo VARCHAR(50) NOT NULL COMMENT 'PRODUCCION, SOLICITUD, RESERVA, ENTREGA',
    est_orden INT NOT NULL,
    est_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activo, 0=Inactivo',
    est_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    est_id_usuario_creacion INT,
    est_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    est_id_usuario_modificacion INT,
    
    CONSTRAINT fk_est_usuario_creacion FOREIGN KEY (est_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_est_usuario_modificacion FOREIGN KEY (est_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT uk_est_modulo_codigo UNIQUE (est_modulo, est_codigo),
    
    INDEX idx_est_estado (est_estado),
    INDEX idx_est_modulo (est_modulo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 05. TABLA: ESP_ESPECIES (Catálogo de especies)
-- ========================================================
CREATE TABLE IF NOT EXISTS esp_especies (
    esp_id INT AUTO_INCREMENT PRIMARY KEY,
    esp_codigo VARCHAR(50) NOT NULL UNIQUE,
    esp_nombre_comun VARCHAR(150) NOT NULL,
    esp_nombre_cientifico VARCHAR(150),
    esp_descripcion TEXT,
    esp_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activa, 0=Inactiva',
    esp_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    esp_id_usuario_creacion INT NOT NULL,
    esp_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    esp_id_usuario_modificacion INT,
    
    CONSTRAINT fk_esp_usuario_creacion FOREIGN KEY (esp_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_esp_usuario_modificacion FOREIGN KEY (esp_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_esp_estado (esp_estado),
    INDEX idx_esp_codigo (esp_codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 06. TABLA: BEN_BENEFICIARIOS (Beneficiarios)
-- ========================================================
CREATE TABLE IF NOT EXISTS ben_beneficiarios (
    ben_id INT AUTO_INCREMENT PRIMARY KEY,
    ben_codigo VARCHAR(50) NOT NULL UNIQUE,
    ben_tipo VARCHAR(50) NOT NULL COMMENT 'PERSONA, ESCUELA, COMUNIDAD, INSTITUCION',
    ben_nombre VARCHAR(150) NOT NULL,
    ben_nit VARCHAR(20),
    ben_dpi VARCHAR(15),
    ben_responsable VARCHAR(150),
    ben_departamento VARCHAR(100),
    ben_municipio VARCHAR(100),
    ben_descripcion TEXT,
    ben_telefono VARCHAR(20),
    ben_email VARCHAR(150),
    ben_direccion TEXT,
    ben_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activo, 0=Inactivo',
    ben_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ben_id_usuario_creacion INT NOT NULL,
    ben_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    ben_id_usuario_modificacion INT,
    
    CONSTRAINT fk_ben_usuario_creacion FOREIGN KEY (ben_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_ben_usuario_modificacion FOREIGN KEY (ben_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_ben_estado (ben_estado),
    INDEX idx_ben_tipo (ben_tipo),
    INDEX idx_ben_codigo (ben_codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 07. TABLA: ARE_AREAS_VIVERO (Áreas del vivero)
-- ========================================================
CREATE TABLE IF NOT EXISTS are_areas_vivero (
    are_id INT AUTO_INCREMENT PRIMARY KEY,
    are_codigo VARCHAR(50) NOT NULL UNIQUE,
    are_nombre VARCHAR(150) NOT NULL,
    are_descripcion TEXT,
    are_ubicacion VARCHAR(255),
    are_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activa, 0=Inactiva',
    are_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    are_id_usuario_creacion INT NOT NULL,
    are_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    are_id_usuario_modificacion INT,
    
    CONSTRAINT fk_are_usuario_creacion FOREIGN KEY (are_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_are_usuario_modificacion FOREIGN KEY (are_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_are_estado (are_estado),
    INDEX idx_are_codigo (are_codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- FASE 3: PRODUCCIÓN
-- ========================================================

-- 08. TABLA: LOT_LOTES (Lotes de producción)
-- ========================================================
CREATE TABLE IF NOT EXISTS lot_lotes (
    lot_id INT AUTO_INCREMENT PRIMARY KEY,
    lot_codigo VARCHAR(50) NOT NULL UNIQUE,
    lot_id_especie INT NOT NULL,
    lot_cantidad_inicial INT NOT NULL,
    lot_cantidad_actual INT NOT NULL,
    lot_fecha_inicio DATE NOT NULL,
    lot_id_responsable INT NOT NULL,
    lot_id_area INT NOT NULL,
    lot_observaciones TEXT,
    lot_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activo, 0=Cancelado',
    lot_id_estado_proceso INT NOT NULL,
    lot_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lot_id_usuario_creacion INT NOT NULL,
    lot_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    lot_id_usuario_modificacion INT,
    
    CONSTRAINT fk_lot_especie FOREIGN KEY (lot_id_especie) REFERENCES esp_especies(esp_id),
    CONSTRAINT fk_lot_responsable FOREIGN KEY (lot_id_responsable) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_lot_area FOREIGN KEY (lot_id_area) REFERENCES are_areas_vivero(are_id),
    CONSTRAINT fk_lot_estado_proceso FOREIGN KEY (lot_id_estado_proceso) REFERENCES est_estados(est_id),
    CONSTRAINT fk_lot_usuario_creacion FOREIGN KEY (lot_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_lot_usuario_modificacion FOREIGN KEY (lot_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_lot_estado (lot_estado),
    INDEX idx_lot_codigo (lot_codigo),
    INDEX idx_lot_id_especie (lot_id_especie),
    INDEX idx_lot_id_estado_proceso (lot_id_estado_proceso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 09. TABLA: ETP_ETAPAS_PRODUCCION (Etapas de un lote - SIMPLIFICADA)
-- ========================================================
CREATE TABLE IF NOT EXISTS etp_etapas_produccion (
    etp_id INT AUTO_INCREMENT PRIMARY KEY,
    etp_id_lote INT NOT NULL,
    etp_id_estado_proceso INT NOT NULL,
    etp_fecha_inicio DATE NOT NULL,
    etp_fecha_fin DATE,
    etp_cantidad INT,
    etp_id_area INT NOT NULL,
    etp_id_responsable INT NOT NULL,
    etp_observaciones TEXT,
    etp_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Válido, 0=Inactivo',
    etp_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    etp_id_usuario_creacion INT NOT NULL,
    etp_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    etp_id_usuario_modificacion INT,
    
    CONSTRAINT fk_etp_lote FOREIGN KEY (etp_id_lote) REFERENCES lot_lotes(lot_id),
    CONSTRAINT fk_etp_estado_proceso FOREIGN KEY (etp_id_estado_proceso) REFERENCES est_estados(est_id),
    CONSTRAINT fk_etp_area FOREIGN KEY (etp_id_area) REFERENCES are_areas_vivero(are_id),
    CONSTRAINT fk_etp_responsable FOREIGN KEY (etp_id_responsable) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_etp_usuario_creacion FOREIGN KEY (etp_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_etp_usuario_modificacion FOREIGN KEY (etp_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_etp_id_lote (etp_id_lote),
    INDEX idx_etp_estado (etp_estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- FASE 4: INVENTARIO
-- ========================================================

-- 10. TABLA: INV_INVENTARIO (Existencias disponibles - CORREGIDA)
-- ========================================================
CREATE TABLE IF NOT EXISTS inv_inventario (
    inv_id INT AUTO_INCREMENT PRIMARY KEY,
    inv_id_lote INT NOT NULL UNIQUE,
    inv_id_area INT NOT NULL,
    inv_cantidad_total INT NOT NULL,
    inv_cantidad_reservada INT NOT NULL DEFAULT 0,
    inv_fecha_disponibilidad DATE,
    inv_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Disponible, 0=No disponible',
    inv_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    inv_id_usuario_creacion INT NOT NULL,
    inv_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    inv_id_usuario_modificacion INT,
    
    CONSTRAINT fk_inv_lote FOREIGN KEY (inv_id_lote) REFERENCES lot_lotes(lot_id),
    CONSTRAINT fk_inv_area FOREIGN KEY (inv_id_area) REFERENCES are_areas_vivero(are_id),
    CONSTRAINT fk_inv_usuario_creacion FOREIGN KEY (inv_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_inv_usuario_modificacion FOREIGN KEY (inv_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_inv_estado (inv_estado),
    INDEX idx_inv_id_area (inv_id_area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. TABLA: MOV_MOVIMIENTOS_INVENTARIO (Historial de movimientos)
-- ========================================================
CREATE TABLE IF NOT EXISTS mov_movimientos_inventario (
    mov_id INT AUTO_INCREMENT PRIMARY KEY,
    mov_id_inventario INT NOT NULL,
    mov_tipo VARCHAR(50) NOT NULL COMMENT 'INGRESO, RESERVA, LIBERACION_RESERVA, SALIDA_ENTREGA, PERDIDA, AJUSTE_POSITIVO, AJUSTE_NEGATIVO',
    mov_cantidad INT NOT NULL,
    mov_motivo VARCHAR(255),
    mov_id_usuario INT NOT NULL,
    mov_referencia VARCHAR(30) COMMENT 'ENTREGA, SOLICITUD, etc.',
    mov_id_referencia INT COMMENT 'ID de la entidad referenciada',
    mov_fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    mov_observaciones TEXT,
    mov_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Válido, 0=Anulado',
    
    CONSTRAINT fk_mov_inventario FOREIGN KEY (mov_id_inventario) REFERENCES inv_inventario(inv_id),
    CONSTRAINT fk_mov_usuario FOREIGN KEY (mov_id_usuario) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_mov_id_inventario (mov_id_inventario),
    INDEX idx_mov_tipo (mov_tipo),
    INDEX idx_mov_referencia (mov_referencia),
    INDEX idx_mov_fecha (mov_fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- FASE 5: SOLICITUDES
-- ========================================================

-- 12. TABLA: SOL_SOLICITUDES (Solicitudes de plantas)
-- ========================================================
CREATE TABLE IF NOT EXISTS sol_solicitudes (
    sol_id INT AUTO_INCREMENT PRIMARY KEY,
    sol_codigo VARCHAR(50) NOT NULL UNIQUE,
    sol_id_beneficiario INT NOT NULL,
    sol_fecha_solicitud DATE NOT NULL,
    sol_fecha_requerida DATE,
    sol_motivo TEXT,
    sol_destino_descripcion TEXT,
    sol_observaciones TEXT,
    sol_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activa, 0=Inactiva',
    sol_id_estado_proceso INT NOT NULL,
    sol_id_usuario_creacion INT NOT NULL,
    sol_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sol_id_usuario_revision INT,
    sol_fecha_revision DATETIME,
    sol_observacion_revision TEXT,
    sol_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    sol_id_usuario_modificacion INT,
    
    CONSTRAINT fk_sol_beneficiario FOREIGN KEY (sol_id_beneficiario) REFERENCES ben_beneficiarios(ben_id),
    CONSTRAINT fk_sol_estado_proceso FOREIGN KEY (sol_id_estado_proceso) REFERENCES est_estados(est_id),
    CONSTRAINT fk_sol_usuario_creacion FOREIGN KEY (sol_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_sol_usuario_revision FOREIGN KEY (sol_id_usuario_revision) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_sol_usuario_modificacion FOREIGN KEY (sol_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_sol_estado (sol_estado),
    INDEX idx_sol_codigo (sol_codigo),
    INDEX idx_sol_id_beneficiario (sol_id_beneficiario),
    INDEX idx_sol_id_estado_proceso (sol_id_estado_proceso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. TABLA: SOD_SOLICITUDES_DETALLE (Detalles de solicitud)
-- ========================================================
CREATE TABLE IF NOT EXISTS sod_solicitudes_detalle (
    sod_id INT AUTO_INCREMENT PRIMARY KEY,
    sod_id_solicitud INT NOT NULL,
    sod_id_especie INT NOT NULL,
    sod_id_inventario INT NOT NULL,
    sod_cantidad_solicitada INT NOT NULL,
    sod_cantidad_aprobada INT NOT NULL DEFAULT 0,
    sod_cantidad_entregada INT NOT NULL DEFAULT 0,
    sod_observaciones TEXT,
    sod_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activo, 0=Cancelado',
    sod_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sod_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_sod_solicitud FOREIGN KEY (sod_id_solicitud) REFERENCES sol_solicitudes(sol_id),
    CONSTRAINT fk_sod_especie FOREIGN KEY (sod_id_especie) REFERENCES esp_especies(esp_id),
    CONSTRAINT fk_sod_inventario FOREIGN KEY (sod_id_inventario) REFERENCES inv_inventario(inv_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uk_sod_solicitud_especie UNIQUE (sod_id_solicitud, sod_id_especie),
    
    INDEX idx_sod_id_solicitud (sod_id_solicitud),
    INDEX idx_sod_id_especie (sod_id_especie),
    INDEX idx_sod_inventario (sod_id_inventario),
    INDEX idx_sod_estado (sod_estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. TABLA: RES_RESERVAS (Reservas de inventario)
-- ========================================================
CREATE TABLE IF NOT EXISTS res_reservas (
    res_id INT AUTO_INCREMENT PRIMARY KEY,
    res_id_solicitud_detalle INT NOT NULL,
    res_id_inventario INT NOT NULL,
    res_cantidad INT NOT NULL,
    res_fecha_reserva DATE NOT NULL,
    res_fecha_liberacion DATE,
    res_observaciones TEXT,
    res_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activa, 0=Cancelada',
    res_id_estado_proceso INT NOT NULL,
    res_id_usuario_creacion INT NOT NULL,
    res_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    res_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    res_id_usuario_modificacion INT,
    
    CONSTRAINT fk_res_solicitud_detalle FOREIGN KEY (res_id_solicitud_detalle) REFERENCES sod_solicitudes_detalle(sod_id),
    CONSTRAINT fk_res_inventario FOREIGN KEY (res_id_inventario) REFERENCES inv_inventario(inv_id),
    CONSTRAINT fk_res_estado_proceso FOREIGN KEY (res_id_estado_proceso) REFERENCES est_estados(est_id),
    CONSTRAINT fk_res_usuario_creacion FOREIGN KEY (res_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_res_usuario_modificacion FOREIGN KEY (res_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_res_estado (res_estado),
    INDEX idx_res_id_solicitud_detalle (res_id_solicitud_detalle),
    INDEX idx_res_id_inventario (res_id_inventario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- FASE 6: DISTRIBUCIÓN Y ENTREGAS
-- ========================================================

-- 15. TABLA: ENT_ENTREGAS (Entregas de plantas)
-- ========================================================
CREATE TABLE IF NOT EXISTS ent_entregas (
    ent_id INT AUTO_INCREMENT PRIMARY KEY,
    ent_codigo VARCHAR(50) NOT NULL UNIQUE,
    ent_id_solicitud INT NOT NULL,
    ent_id_beneficiario INT NOT NULL,
    ent_fecha_programada DATE NOT NULL,
    ent_fecha_entrega DATE,
    ent_id_responsable INT NOT NULL,
    ent_recibe_nombre VARCHAR(150),
    ent_recibe_dpi VARCHAR(15),
    ent_lugar_entrega TEXT,
    ent_observaciones TEXT,
    ent_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Activa, 0=Cancelada',
    ent_id_estado_proceso INT NOT NULL,
    ent_id_usuario_creacion INT NOT NULL,
    ent_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ent_fecha_modificacion TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    ent_id_usuario_modificacion INT,
    
    CONSTRAINT fk_ent_solicitud FOREIGN KEY (ent_id_solicitud) REFERENCES sol_solicitudes(sol_id),
    CONSTRAINT fk_ent_beneficiario FOREIGN KEY (ent_id_beneficiario) REFERENCES ben_beneficiarios(ben_id),
    CONSTRAINT fk_ent_responsable FOREIGN KEY (ent_id_responsable) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_ent_estado_proceso FOREIGN KEY (ent_id_estado_proceso) REFERENCES est_estados(est_id),
    CONSTRAINT fk_ent_usuario_creacion FOREIGN KEY (ent_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    CONSTRAINT fk_ent_usuario_modificacion FOREIGN KEY (ent_id_usuario_modificacion) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_ent_estado (ent_estado),
    INDEX idx_ent_codigo (ent_codigo),
    INDEX idx_ent_id_solicitud (ent_id_solicitud),
    INDEX idx_ent_id_estado_proceso (ent_id_estado_proceso)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. TABLA: END_ENTREGAS_DETALLE (Detalles de entrega - CORREGIDA)
-- ========================================================
CREATE TABLE IF NOT EXISTS end_entregas_detalle (
    end_id INT AUTO_INCREMENT PRIMARY KEY,
    end_id_entrega INT NOT NULL,
    end_id_solicitud_detalle INT NOT NULL,
    end_id_reserva INT NOT NULL,
    end_id_inventario INT NOT NULL,
    end_cantidad_entregada INT NOT NULL,
    end_observaciones TEXT,
    end_estado TINYINT NOT NULL DEFAULT 1 COMMENT '1=Entregado, 0=Falta recibir',
    end_fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    end_id_usuario_creacion INT NOT NULL,
    
    CONSTRAINT fk_end_entrega FOREIGN KEY (end_id_entrega) REFERENCES ent_entregas(ent_id),
    CONSTRAINT fk_end_solicitud_detalle FOREIGN KEY (end_id_solicitud_detalle) REFERENCES sod_solicitudes_detalle(sod_id),
    CONSTRAINT fk_end_reserva FOREIGN KEY (end_id_reserva) REFERENCES res_reservas(res_id),
    CONSTRAINT fk_end_inventario FOREIGN KEY (end_id_inventario) REFERENCES inv_inventario(inv_id),
    CONSTRAINT fk_end_usuario_creacion FOREIGN KEY (end_id_usuario_creacion) REFERENCES usu_usuarios(usu_id),
    
    INDEX idx_end_id_entrega (end_id_entrega),
    INDEX idx_end_estado (end_estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- FASE 7: DATOS INICIALES
-- ========================================================

-- Insertar roles iniciales (DER v1.0 - simplificados)
INSERT INTO rol_roles (rol_codigo, rol_nombre, rol_descripcion, rol_estado) VALUES
('ADMIN', 'Administrador', 'Acceso completo a la administración y configuración del sistema', 1),
('VIVERO', 'Encargado de Vivero', 'Gestiona los procesos de producción e inventario de plantas', 1),
('GESTION', 'Encargado de Gestión', 'Gestiona beneficiarios, solicitudes, reservas y entregas', 1),
('CONSULTA', 'Usuario de Consulta', 'Consulta información, reportes y dashboard sin modificar procesos operativos', 1);

-- Insertar estados centralizados (25 estados) - DER v1.0
INSERT INTO est_estados (est_codigo, est_descripcion, est_modulo, est_orden, est_estado) VALUES
-- PRODUCCIÓN (8)
('PLANIFICADO', 'Lote planificado', 'PRODUCCION', 1, 1),
('SIEMBRA', 'En proceso de siembra', 'PRODUCCION', 2, 1),
('GERMINACION', 'En germinación', 'PRODUCCION', 3, 1),
('CRECIMIENTO', 'En crecimiento', 'PRODUCCION', 4, 1),
('ENDURECIMIENTO', 'En endurecimiento', 'PRODUCCION', 5, 1),
('DISPONIBLE', 'Disponible para inventario y distribución', 'PRODUCCION', 6, 1),
('FINALIZADO', 'Proceso de producción finalizado', 'PRODUCCION', 7, 1),
('CANCELADO', 'Lote cancelado', 'PRODUCCION', 8, 1),
-- SOLICITUDES (7)
('REGISTRADA', 'Solicitud registrada', 'SOLICITUD', 1, 1),
('EN_REVISION', 'Solicitud en revisión', 'SOLICITUD', 2, 1),
('APROBADA', 'Solicitud aprobada', 'SOLICITUD', 3, 1),
('RECHAZADA', 'Solicitud rechazada', 'SOLICITUD', 4, 1),
('EN_PREPARACION', 'Solicitud en preparación', 'SOLICITUD', 5, 1),
('ATENDIDA', 'Solicitud completamente atendida', 'SOLICITUD', 6, 1),
('CANCELADO', 'Solicitud cancelada', 'SOLICITUD', 7, 1),
-- RESERVAS (4)
('RESERVADA', 'Plantas reservadas', 'RESERVA', 1, 1),
('UTILIZADA', 'Reserva utilizada en una entrega', 'RESERVA', 2, 1),
('LIBERADA', 'Reserva liberada', 'RESERVA', 3, 1),
('CANCELADO', 'Reserva cancelada', 'RESERVA', 4, 1),
-- ENTREGAS (6)
('PROGRAMADA', 'Entrega programada', 'ENTREGA', 1, 1),
('EN_PREPARACION', 'Entrega en preparación', 'ENTREGA', 2, 1),
('LISTA', 'Entrega lista para despacho', 'ENTREGA', 3, 1),
('ENTREGA_PARCIAL', 'Entrega realizada parcialmente', 'ENTREGA', 4, 1),
('ENTREGADA', 'Entrega completada', 'ENTREGA', 5, 1),
('CANCELADO', 'Entrega cancelada', 'ENTREGA', 6, 1);

-- ========================================================
-- FIN DEL SCRIPT
-- ========================================================
-- Status: Script DER v1.0 CORREGIDO
-- Total de tablas: 16
-- Total de relaciones FK: Definidas correctamente
-- Estados iniciales: 25 (sin duplicados por módulo)
-- Roles iniciales: 4 (ADMIN, VIVERO, GESTION, CONSULTA)
-- Usuario administrador: NO CREADO (se generará desde Node.js)
-- ========================================================
