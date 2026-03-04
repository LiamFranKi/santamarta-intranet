import React, { createContext, useContext, useState } from 'react';

const AvatarWidgetContext = createContext(null);

export function AvatarWidgetProvider({ children }) {
  const [avatarWidget, setAvatarWidget] = useState(null);
  return (
    <AvatarWidgetContext.Provider value={{ avatarWidget, setAvatarWidget }}>
      {children}
    </AvatarWidgetContext.Provider>
  );
}

export function useAvatarWidget() {
  const ctx = useContext(AvatarWidgetContext);
  return ctx || { avatarWidget: null, setAvatarWidget: () => {} };
}
