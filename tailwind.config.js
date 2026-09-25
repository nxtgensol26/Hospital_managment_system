/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // NxtHealth brand palette — light, clinical, trustworthy
        brand: {
          50: '#eef6ff',
          100: '#d9ecff',
          200: '#bcdcff',
          300: '#8ec6ff',
          400: '#59a6ff',
          500: '#2f84f5',
          600: '#1866e0',
          700: '#1451b6',
          800: '#164593',
          900: '#173c74',
          950: '#0f2547',
        },
        teal: {
          50: '#eefdfb',
          100: '#d3f8f3',
          200: '#abefe8',
          300: '#72e0d8',
          400: '#37c7bf',
          500: '#16aaa4',
          600: '#0d8985',
          700: '#106e6c',
          800: '#125858',
          900: '#134a4a',
        },
        navy: {
          700: '#1e2a52',
          800: '#161f3d',
          900: '#0f1730',
        },
        ink: {
          DEFAULT: '#0f1e3d',
          soft: '#42536e',
          faint: '#8494ac',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f4f8fc',
          sunken: '#eef3f9',
          line: '#e2eaf2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,40,80,.04), 0 8px 24px rgba(16,40,80,.06)',
        pop: '0 12px 40px rgba(16,40,80,.14)',
        rail: '2px 0 16px rgba(16,40,80,.05)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.15rem',
      },
      keyframes: {
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'draw': { '0%': { strokeDashoffset: '1' }, '100%': { strokeDashoffset: '0' } },
        'shimmer': { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-in': 'fade-in .5s ease both',
        'fade-up': 'fade-up .5s cubic-bezier(.22,1,.36,1) both',
        'scale-in': 'scale-in .4s cubic-bezier(.22,1,.36,1) both',
      },
    },
  },
  plugins: [],
}
