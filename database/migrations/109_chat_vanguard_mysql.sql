-- Chat Vanguard: salas de aula, personal y 1 a 1
CREATE TABLE IF NOT EXISTS chat_salas (
  id INT NOT NULL AUTO_INCREMENT,
  colegio_id INT NOT NULL,
  tipo ENUM('aula','personal','dm') NOT NULL,
  clave VARCHAR(80) NOT NULL,
  grupo_id INT NULL,
  user_a_id INT NULL,
  user_b_id INT NULL,
  titulo VARCHAR(180) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_chat_sala (colegio_id, clave),
  KEY idx_chat_sala_grupo (colegio_id, grupo_id),
  KEY idx_chat_sala_dm (colegio_id, user_a_id, user_b_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_mensajes (
  id BIGINT NOT NULL AUTO_INCREMENT,
  sala_id INT NOT NULL,
  usuario_id INT NOT NULL,
  texto VARCHAR(2000) NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_chat_msg_sala (sala_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_lecturas (
  sala_id INT NOT NULL,
  usuario_id INT NOT NULL,
  last_id BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (sala_id, usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
