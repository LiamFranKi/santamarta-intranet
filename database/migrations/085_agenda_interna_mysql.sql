-- Agenda interna del colegio (no se publica en la web).
-- Visible: administrador, coordinador, promotoría, dirección y docentes.
-- Gestión (crear/editar/cerrar): administrador, coordinador, promotoría y dirección.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS agenda_interna_eventos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  colegio_id INT NOT NULL,
  titulo VARCHAR(160) NOT NULL,
  descripcion MEDIUMTEXT NULL,
  tipo VARCHAR(32) NOT NULL DEFAULT 'OPERATIVO',
  lugar VARCHAR(160) NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  estado ENUM('PENDIENTE','HECHO','CANCELADO') NOT NULL DEFAULT 'PENDIENTE',
  aviso_dias VARCHAR(64) NOT NULL DEFAULT '7,3,1,0',
  avisos_roles VARCHAR(255) NOT NULL DEFAULT 'ADMINISTRADOR,COORDINADOR,PROMOTORIA,DIRECTOR,DOCENTE',
  creado_por INT NOT NULL,
  hecho_por INT NULL,
  hecho_en DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_ai_colegio_fechas (colegio_id, fecha_inicio, fecha_fin),
  KEY idx_ai_colegio_estado_fin (colegio_id, estado, fecha_fin),
  KEY idx_ai_creado_por (creado_por)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agenda_interna_notif_log (
  evento_id INT UNSIGNED NOT NULL,
  fase VARCHAR(24) NOT NULL COMMENT 'CREACION, ANTES_10, ANTES_7, ANTES_5, ANTES_3, ANTES_1, HOY, VENCIDO',
  enviado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (evento_id, fase),
  KEY idx_ai_notif_enviado (enviado_en),
  CONSTRAINT fk_ai_notif_evento FOREIGN KEY (evento_id) REFERENCES agenda_interna_eventos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
