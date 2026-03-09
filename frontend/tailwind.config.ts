import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'DM Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
        display: ['var(--font-display)', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: '#0B0F1A',
        background: '#0B0F1A',
        surface: '#141829',
        'surface-alt': '#1A1F35',
        'surface-raised': '#1E2340',
        elevated: '#232845',
        hover: '#2A3050',
        input: '#111525',
        border: {
          DEFAULT: '#262C48',
          light: '#1E2340',
          focus: '#7C5CFC',
        },
        accent: {
          DEFAULT: '#7C5CFC',
          dim: 'rgba(124,92,252,0.10)',
          contrast: '#ffffff',
          hover: '#6B4FE0',
        },
        certified: {
          DEFAULT: '#eab308',
          dim: 'rgba(234,179,8,0.10)',
        },
        status: {
          green: '#34D399',
          'green-dim': 'rgba(52,211,153,0.10)',
          amber: '#FBBF24',
          'amber-dim': 'rgba(251,191,36,0.10)',
          red: '#F87171',
          'red-dim': 'rgba(248,113,113,0.10)',
          blue: '#60A5FA',
          'blue-dim': 'rgba(96,165,250,0.10)',
        },
        ai: {
          purple: '#A78BFA',
          'purple-dim': 'rgba(167,139,250,0.06)',
          'purple-border': 'rgba(167,139,250,0.20)',
        },
        equity: {
          DEFAULT: '#A78BFA',
          dim: 'rgba(167,139,250,0.12)',
        },
      },
      textColor: {
        primary: '#F1F1F4',
        'text-primary': '#F1F1F4',
        secondary: '#8B90A7',
        'text-secondary': '#8B90A7',
        tertiary: '#5C6280',
        'text-tertiary': '#5C6280',
        muted: '#3D4260',
        'text-muted': '#3D4260',
      },
      borderRadius: {
        card: '12px',
        input: '8px',
      },
      spacing: {
        'sidebar': '240px',
        'sidebar-collapsed': '56px',
        'topbar': '56px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)',
        'glow-accent': '0 0 20px rgba(124,92,252,0.15)',
        'glow-green': '0 0 20px rgba(52,211,153,0.15)',
        'glow-gold': '0 0 30px rgba(234,179,8,0.20)',
      },
    },
  },
  plugins: [],
};

export default config;
