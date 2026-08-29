/**
 * Daily.co: crear sala y token. Si no hay DAILY_API_KEY + DAILY_DOMAIN, no hace nada.
 * LiveKit se podrá sumar después con el mismo campo video_proveedor.
 */
const axios = require('axios');
const DAILY_API = 'https://api.daily.co/v1';

function dailyConfigurado() {
  return !!(String(process.env.DAILY_API_KEY || '').trim() && String(process.env.DAILY_DOMAIN || '').trim());
}

function dailyDomain() {
  return String(process.env.DAILY_DOMAIN || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\.daily\.co.*$/i, '')
    .replace(/\/.*$/, '');
}

function urlSalaDaily(roomName) {
  if (!roomName || !dailyDomain()) return null;
  return `https://${dailyDomain()}.daily.co/${roomName}`;
}

async function dailyFetch(pathname, body) {
  const key = String(process.env.DAILY_API_KEY || '').trim();
  try {
    const res = await axios.post(`${DAILY_API}${pathname}`, body || {}, {
      headers: { Authorization: `Bearer ${key}` },
      timeout: 15000,
    });
    return res.data || {};
  } catch (e) {
    const data = e.response?.data || {};
    const msg = data.error || data.info || e.message || `Daily respondió ${e.response?.status || '?'}`;
    const err = new Error(msg);
    err.status = e.response?.status >= 400 && e.response?.status < 500 ? 400 : 502;
    throw err;
  }
}

async function asegurarSalaDaily(reunion) {
  if (!dailyConfigurado()) return { ok: false, motivo: 'sin_clave' };
  if (reunion.daily_room_name) {
    return { ok: true, room: reunion.daily_room_name, url: urlSalaDaily(reunion.daily_room_name) };
  }
  const name = `re-${reunion.colegio_id}-${reunion.id}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  try {
    await dailyFetch('/rooms', {
      name,
      privacy: 'private',
      properties: {
        enable_screenshare: true,
        enable_chat: false,
        start_audio_off: false,
        start_video_off: false,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
      },
    });
  } catch (e) {
    if (!/already exists|taken/i.test(String(e.message || ''))) throw e;
  }
  return { ok: true, room: name, url: urlSalaDaily(name) };
}

async function tokenDaily({ roomName, userName, isOwner, userId }) {
  if (!dailyConfigurado()) return null;
  const data = await dailyFetch('/meeting-tokens', {
    properties: {
      room_name: roomName,
      user_name: String(userName || 'Participante').slice(0, 80),
      user_id: String(userId || ''),
      is_owner: !!isOwner,
      enable_screenshare: true,
      enable_recording: false,
    },
  });
  return data.token || null;
}

async function borrarSalaDaily(roomName) {
  if (!dailyConfigurado() || !roomName) return;
  const key = String(process.env.DAILY_API_KEY || '').trim();
  try {
    await axios.delete(`${DAILY_API}/rooms/${encodeURIComponent(roomName)}`, {
      headers: { Authorization: `Bearer ${key}` },
      timeout: 12000,
    });
  } catch (e) {
    if (e.response?.status !== 404) {
      console.error('[reuniones] daily borrar sala', e.response?.data || e.message);
    }
  }
}

module.exports = {
  dailyConfigurado,
  dailyDomain,
  urlSalaDaily,
  asegurarSalaDaily,
  tokenDaily,
  borrarSalaDaily,
};
