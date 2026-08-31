import React from 'react';

export const VANGUARDROOM_LOGO = '/icons/vanguardroom-mark.png';

export default function VanguardRoomMarca({ compact = false, invert = false }) {
  return (
    <div className={`vr-marca ${compact ? 'vr-marca-compact' : ''} ${invert ? 'vr-marca-invert' : ''}`}>
      <img src={VANGUARDROOM_LOGO} alt="" width={compact ? 28 : 44} height={compact ? 28 : 44} />
      <div className="vr-marca-text">
        <div className="vr-word">
          Vanguard<span>Room</span>
        </div>
        {compact ? null : <div className="vr-sub">Sala de videollamada</div>}
      </div>
    </div>
  );
}
