import { useEffect, useRef } from 'react';

export function useScrollFlasher() {
  let scrollRef = useRef(null);

  useEffect(() => {
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.flashScrollIndicators();
      }
    }, 1000);
  }, []);

  return scrollRef;
}

export function useSetMobileThemeColor(color, opts) {
  useEffect(() => {
    if (opts && opts.skip) return;
    const metaTags = document.getElementsByTagName('meta');
    const themeTag = [...metaTags].find(tag => tag.name === 'theme-color');
    themeTag.setAttribute('content', color);
  });
}
