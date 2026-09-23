/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070710',
          900: '#0b0b18',
          850: '#111120',
          800: '#161628',
          700: '#1e1e34',
          600: '#2a2a44',
          500: '#3a3a58',
          400: '#52527a',
        },
        brand: {
          50: '#eefcff',
          100: '#d4f6ff',
          200: '#aeeefb',
          300: '#76e0f5',
          400: '#38c8e6',
          500: '#11a6cc',
          600: '#0a84a8',
          700: '#0c6a87',
          800: '#10556e',
          900: '#13465b',
        },
        gold: {
          400: '#f5c451',
          500: '#e6a817',
          600: '#c4860a',
        },
        success: {
          500: '#2dd4a7',
          600: '#14b88f',
        },
        warning: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        danger: {
          400: '#fb6f6f',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 8px 30px -6px rgba(0,0,0,0.5), 0 2px 8px -2px rgba(0,0,0,0.3)',
        'card-hover': '0 16px 50px -8px rgba(0,0,0,0.6), 0 4px 16px -4px rgba(0,0,0,0.4)',
        glow: '0 0 30px -4px rgba(56,200,230,0.4)',
        'glow-gold': '0 0 30px -4px rgba(245,196,81,0.35)',
        'inner-soft': 'inset 0 1px 0 0 rgba(255,255,255,0.06), inset 0 -1px 0 0 rgba(0,0,0,0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.45s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.16,1,0.3,1)',
        'pulse-soft': 'pulseSoft 2.5s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
