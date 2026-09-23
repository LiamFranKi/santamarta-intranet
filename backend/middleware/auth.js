const jwt = require('jsonwebtoken');
const { query } = require('../utils/mysql');
const { tipoSesionPublico, esSuperadmin } = require('../utils/superadminOculto');

const sesionCache = new Map();
const SESION_TTL_MS = 8000;

function sesionDesdeCache(usuarioId) {
  const hit = sesionCache.get(Number(usuarioId));
  if (!hit || hit.exp < Date.now()) {
    sesionCache.delete(Number(usuarioId));
    return null;
  }
  return hit.row;
}

function guardarSesionCache(usuarioId, row) {
  if (sesionCache.size > 4000) {
    const now = Date.now();
    for (const [k, v] of sesionCache) {
      if (v.exp < now) sesionCache.delete(k);
    }
    if (sesionCache.size > 4000) sesionCache.clear();
  }
  sesionCache.set(Number(usuarioId), { row, exp: Date.now() + SESION_TTL_MS });
}

function esPoolSaturado(error) {
  return /queue limit reached/i.test(String(error?.message || ''));
}

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
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    try {
      const usuarioId = user?.usuario_id ?? user?.id;
      if (!usuarioId) {
        return res.status(403).json({ error: 'Token inválido' });
      }

      // Estado activo + versión de sesión (cache corto: evita saturar el pool)
      let estadoRow = sesionDesdeCache(usuarioId);
      if (!estadoRow) {
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
        if (estadoRow) guardarSesionCache(usuarioId, estadoRow);
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

      const tipoReal = estadoRow.tipo || user.tipo;
      req.user = {
        ...user,
        tipo: tipoSesionPublico(tipoReal),
        es_superadmin: esSuperadmin(tipoReal),
      };
      next();
    } catch (e) {
      console.error('[auth] validación sesión:', e.message);
      if (esPoolSaturado(e)) {
        return res.status(503).json({
          error: 'El servidor está ocupado. Intente de nuevo en un momento.',
          code: 'MYSQL_BUSY',
        });
      }
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
