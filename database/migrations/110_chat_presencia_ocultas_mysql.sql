-- Quién está leyendo ahora, y chats privados ocultos para un usuario
CREATE TABLE IF NOT EXISTS chat_presencia (
  sala_id INT NOT NULL,
  usuario_id INT NOT NULL,
  visto_at DATETIME NOT NULL,
  PRIMARY KEY (sala_id, usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_sesion (
  usuario_id INT NOT NULL,
  tab_id VARCHAR(40) NOT NULL,
  visto_at DATETIME NOT NULL,
  PRIMARY KEY (usuario_id, tab_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS chat_ocultas (
  sala_id INT NOT NULL,
  usuario_id INT NOT NULL,
  hasta_id BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (sala_id, usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
