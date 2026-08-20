/**
 * MÓDULO AISLADO: Generación inteligente de horarios (piloto)
 * Base: vanguard_intranet
 *
 * REGLAS IMPORTANTES:
 * - NO toca ni modifica `grupos_horarios` (horario actual del sistema).
 * - NO borra datos académicos existentes.
 * - Prefijo: horario_gen_*
 * - phpMyAdmin → SQL → pegar y Continuar
 *
 * Fase 1: configuración por año/nivel + bloques horarios.
 * Fases siguientes: disponibilidad, carga, solver, editor (mismas tablas base).
 */

-- ─────────────────────────────────────────────────────────────────────────────
-- Configuración por colegio + año + nivel
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `horario_gen_config` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` SMALLINT NOT NULL COMMENT 'Año lectivo, ej. 2026',
  `nivel_id` INT NOT NULL COMMENT 'FK lógica a niveles.id (catálogo existente)',
  `nombre` VARCHAR(120) NULL COMMENT 'Etiqueta opcional, ej. Secundaria 2026',
  `hora_ingreso` TIME NULL,
  `hora_salida` TIME NULL,
  `dias_semana` VARCHAR(40) NOT NULL DEFAULT '1,2,3,4,5' COMMENT '1=Lunes … 5=Viernes',
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `notas` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hg_config_anio_nivel` (`colegio_id`, `anio`, `nivel_id`),
  KEY `idx_hg_config_anio` (`colegio_id`, `anio`),
  KEY `idx_hg_config_nivel` (`nivel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Piloto horarios: config por año/nivel. NO es grupos_horarios.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Bloques del día (clases, recreo, almuerzo, actividad)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `horario_gen_bloques` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `config_id` INT UNSIGNED NOT NULL,
  `nombre` VARCHAR(80) NOT NULL COMMENT 'ej. Bloque 1, Recreo',
  `hora_inicio` TIME NOT NULL,
  `hora_fin` TIME NOT NULL,
  `tipo` ENUM('CLASS','BREAK','LUNCH','ACTIVITY') NOT NULL DEFAULT 'CLASS',
  `orden` INT NOT NULL DEFAULT 0,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hg_bloques_config` (`config_id`, `orden`),
  CONSTRAINT `fk_hg_bloques_config`
    FOREIGN KEY (`config_id`) REFERENCES `horario_gen_config` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Piloto horarios: bloques por config. BREAK/LUNCH no reciben clases.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Disponibilidad docente (fase siguiente; crear ya la tabla)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `horario_gen_disponibilidad` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` SMALLINT NOT NULL,
  `personal_id` INT NOT NULL COMMENT 'Docente = personal.id existente',
  `dia_semana` TINYINT NOT NULL COMMENT '1=Lunes … 7=Domingo',
  `estado` ENUM('AVAILABLE','UNAVAILABLE','AVAILABLE_UNTIL','AVAILABLE_FROM','CUSTOM_INTERVAL')
    NOT NULL DEFAULT 'AVAILABLE',
  `hora_desde` TIME NULL,
  `hora_hasta` TIME NULL,
  `notas` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hg_disp_docente` (`colegio_id`, `anio`, `personal_id`, `dia_semana`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Piloto horarios: disponibilidad docente. No toca tablas legacy.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Carga semanal (bloques/semana por asignatura-grupo)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `horario_gen_carga` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` SMALLINT NOT NULL,
  `grupo_id` INT NOT NULL COMMENT 'grupos.id existente (grado+sección+año)',
  `curso_id` INT NULL COMMENT 'cursos.id (opcional)',
  `asignatura_id` INT NULL COMMENT 'asignaturas.id si ya existe la carga docente',
  `personal_id` INT NULL COMMENT 'docente preferido/asignado',
  `bloques_semanales` INT NOT NULL DEFAULT 1,
  `bloques_consecutivos_min` INT NOT NULL DEFAULT 1,
  `bloques_consecutivos_max` INT NOT NULL DEFAULT 2,
  `color` VARCHAR(20) NULL DEFAULT NULL,
  `activo` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hg_carga_grupo` (`colegio_id`, `anio`, `grupo_id`),
  KEY `idx_hg_carga_asig` (`asignatura_id`),
  KEY `idx_hg_carga_docente` (`personal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Piloto horarios: horas semanales por grupo/curso. Paralelo a asignaturas.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Versiones de horario generado (borrador / aprobado / publicado piloto)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `horario_gen_versiones` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` SMALLINT NOT NULL,
  `nivel_id` INT NULL,
  `config_id` INT UNSIGNED NULL,
  `nombre` VARCHAR(120) NOT NULL DEFAULT 'Borrador',
  `estado` ENUM('DRAFT','REVIEW','APPROVED','PUBLISHED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `score` DECIMAL(6,2) NULL,
  `notas` TEXT NULL,
  `created_by` INT NULL COMMENT 'usuarios.id',
  `published_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hg_ver_anio` (`colegio_id`, `anio`, `estado`),
  KEY `idx_hg_ver_config` (`config_id`),
  CONSTRAINT `fk_hg_ver_config`
    FOREIGN KEY (`config_id`) REFERENCES `horario_gen_config` (`id`)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Piloto: versiones. PUBLICADO aquí NO escribe en grupos_horarios.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Entradas (celdas) de una versión
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `horario_gen_entradas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `version_id` INT UNSIGNED NOT NULL,
  `bloque_id` INT UNSIGNED NOT NULL,
  `dia_semana` TINYINT NOT NULL COMMENT '1=Lunes … 5=Viernes',
  `grupo_id` INT NOT NULL,
  `curso_id` INT NULL,
  `asignatura_id` INT NULL,
  `personal_id` INT NULL,
  `carga_id` INT UNSIGNED NULL,
  `texto_libre` VARCHAR(120) NULL COMMENT 'Etiqueta manual (Tutoría, etc). NO es curso/libreta.',
  `aula_label` VARCHAR(80) NULL COMMENT 'aula física texto libre (piloto)',
  `locked` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hg_entrada_slot_grupo` (`version_id`, `dia_semana`, `bloque_id`, `grupo_id`),
  KEY `idx_hg_ent_docente` (`version_id`, `personal_id`, `dia_semana`, `bloque_id`),
  KEY `idx_hg_ent_bloque` (`bloque_id`),
  CONSTRAINT `fk_hg_ent_version`
    FOREIGN KEY (`version_id`) REFERENCES `horario_gen_versiones` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `fk_hg_ent_bloque`
    FOREIGN KEY (`bloque_id`) REFERENCES `horario_gen_bloques` (`id`)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Piloto: celdas del horario generado. Independiente de grupos_horarios.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Runs del solver (fase posterior)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `horario_gen_runs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `colegio_id` INT NOT NULL,
  `anio` SMALLINT NOT NULL,
  `version_id` INT UNSIGNED NULL,
  `estado` ENUM('QUEUED','ANALYZING','SOLVING','SCORING','COMPLETE','FAILED') NOT NULL DEFAULT 'QUEUED',
  `progreso` TINYINT NOT NULL DEFAULT 0,
  `mensaje` VARCHAR(500) NULL,
  `diagnostico_json` LONGTEXT NULL,
  `created_by` INT NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_hg_runs_anio` (`colegio_id`, `anio`, `estado`),
  KEY `idx_hg_runs_ver` (`version_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Piloto: jobs de generación automática.';

-- Verificación rápida (opcional):
-- SHOW TABLES LIKE 'horario_gen_%';
-- SELECT COUNT(*) FROM grupos_horarios; -- debe seguir igual; este SQL no la toca.

-- ─────────────────────────────────────────────────────────────────────────────
-- Migración (si ya tenías las tablas creadas): ejecutar solo esto en phpMyAdmin
-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER TABLE `horario_gen_entradas`
--   ADD COLUMN `texto_libre` VARCHAR(120) NULL
--     COMMENT 'Etiqueta manual (Tutoría, etc). NO es curso/libreta.'
--     AFTER `aula_label`;
