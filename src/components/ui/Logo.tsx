import { Layers } from 'lucide-react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

const sizes = {
  sm: { box: 'w-10 h-10', icon: 'w-5 h-5', text: 'text-xl' },
  md: { box: 'w-14 h-14', icon: 'w-7 h-7', text: 'text-2xl' },
  lg: { box: 'w-20 h-20', icon: 'w-10 h-10', text: 'text-4xl' },
};

export function Logo({ size = 'md', showText = true }: LogoProps) {
  const s = sizes[size];

  return (
    <div className="flex items-center gap-3">
      <div
        className={`${s.box} rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-glow`}
      >
        <Layers className={`${s.icon} text-ink-950`} strokeWidth={2.5} />
      </div>
      {showText && (
        <span className={`font-display font-extrabold ${s.text} tracking-tight text-white`}>
          Carta
        </span>
      )}
    </div>
  );
}
