const jwt = require('jsonwebtoken');
const { query } = require('../utils/mysql');
const { tipoSesionPublico } = require('../utils/superadminOculto');

/**
 * Middleware para autenticar requests con JWT.
 * Además valida token_version (cierra sesiones al cambiar clave o forzar logout).
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }

    try {
      const usuarioId = user?.usuario_id ?? user?.id;
      if (!usuarioId) {
        return res.status(403).json({ error: 'Token inválido' });
      }

      // Estado activo + versión de sesión
      let estadoRow;
      try {
        const rows = await query(
          `SELECT estado, token_version, tipo FROM usuarios WHERE id = ? LIMIT 1`,
          [usuarioId]
        );
        estadoRow = rows?.[0];
      } catch (e) {
        if (e.code === 'ER_BAD_FIELD_ERROR' || String(e.message || '').includes('token_version')) {
          const rows = await query(
            `SELECT estado, tipo FROM usuarios WHERE id = ? LIMIT 1`,
            [usuarioId]
          );
          estadoRow = rows?.[0] ? { ...rows[0], token_version: 1 } : null;
        } else {
          throw e;
        }
      }

      if (!estadoRow) {
        return res.status(403).json({ error: 'Usuario no encontrado' });
      }
      if (estadoRow.estado && String(estadoRow.estado).toUpperCase() !== 'ACTIVO') {
        return res.status(403).json({ error: 'Usuario inactivo. Sesión cerrada.' });
      }

      const dbTv = Number.isFinite(parseInt(estadoRow.token_version, 10))
        ? parseInt(estadoRow.token_version, 10)
        : 1;
      // Tokens viejos sin `tv` o con versión distinta → fuera (contención de intrusión)
      if (user.tv == null || Number(user.tv) !== dbTv) {
        return res.status(403).json({
          error: 'Sesión cerrada. Vuelva a iniciar sesión.',
          code: 'SESSION_REVOKED',
        });
      }

      req.user = {
        ...user,
        tipo: tipoSesionPublico(estadoRow.tipo || user.tipo),
      };
      next();
    } catch (e) {
      console.error('[auth] validación sesión:', e.message);
      return res.status(500).json({ error: 'Error de autenticación' });
    }
  });
};

/**
 * Middleware para verificar tipo de usuario
 */
const requireUserType = (...allowedTypes) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    if (!allowedTypes.includes(req.user.tipo)) {
      return res.status(403).json({
        error: 'No tienes permisos para acceder a este recurso',
      });
    }

    next();
  };
};

module.exports = { authenticateToken, requireUserType };
