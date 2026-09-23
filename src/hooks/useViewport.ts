import { useEffect, useState } from 'react';

export interface Viewport {
  width: number;
  height: number;
}

function read(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState(read);
  useEffect(() => {
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewport(read()));
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return viewport;
}

export function useElementWidth<T extends HTMLElement>(ref: React.RefObject<T>): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
