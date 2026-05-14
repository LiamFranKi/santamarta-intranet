import { useEffect, useState } from 'react';

function getIsMobile(maxWidth) {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.innerWidth <= maxWidth;
}

export default function useIsMobileViewport(maxWidth = 768) {
  const [isMobile, setIsMobile] = useState(() => getIsMobile(maxWidth));

  useEffect(() => {
    const updateViewport = () => {
      setIsMobile(getIsMobile(maxWidth));
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [maxWidth]);

  return isMobile;
}
