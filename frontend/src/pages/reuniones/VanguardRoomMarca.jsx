import React from 'react';

export default function VanguardRoomMarca({ compact = false, invert = false }) {
  return (
    <div className={`vr-marca ${compact ? 'vr-marca-compact' : ''} ${invert ? 'vr-marca-invert' : ''}`}>
      <div className="vr-marca-text">
        <div className="vr-word">
          Vanguard<span>Room</span>
        </div>
        {compact ? null : <div className="vr-sub">Sala de videollamada</div>}
      </div>
    </div>
  );
}
