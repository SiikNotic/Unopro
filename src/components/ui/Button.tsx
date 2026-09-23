import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
}

/** Game-style buttons: lacquered surfaces with a physical bottom edge that presses down. */
const variantClasses: Record<Variant, string> = {
  primary: 'btn-game btn-primary',
  secondary: 'btn-game btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-game btn-danger',
};

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-[40px] px-4 text-sm rounded-xl',
  md: 'min-h-[48px] px-6 text-base rounded-2xl',
  lg: 'min-h-[56px] px-7 text-lg rounded-2xl',
};

export function Button({ variant = 'primary', size = 'md', icon, fullWidth = false, className = '', children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2.5 font-display font-bold select-none max-w-full ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
    </button>
  );
}
