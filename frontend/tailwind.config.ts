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
        sans: ['var(--font-sans)', 'DM Sans', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
        display: ['var(--font-display)', 'Instrument Serif', 'Georgia', 'serif'],
      },
      colors: {
        primary: '#0C0E13',
        background: '#0C0E13',
        surface: '#13151C',
        elevated: '#181B24',
        hover: '#1E2130',
        input: '#0F1119',
        border: {
          DEFAULT: '#252836',
          light: '#1E2130',
          focus: '#4A6CF7',
        },
        accent: {
          DEFAULT: '#4A6CF7',
          dim: 'rgba(74,108,247,0.12)',
        },
        status: {
          green: '#34D399',
          'green-dim': 'rgba(52,211,153,0.12)',
          amber: '#FBBF24',
          'amber-dim': 'rgba(251,191,36,0.12)',
          red: '#F87171',
          'red-dim': 'rgba(248,113,113,0.12)',
          blue: '#60A5FA',
          'blue-dim': 'rgba(96,165,250,0.12)',
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
        primary: '#E8EAF0',
        'text-primary': '#E8EAF0',
        secondary: '#8B90A0',
        'text-secondary': '#8B90A0',
        tertiary: '#5A5F73',
        'text-tertiary': '#5A5F73',
        muted: '#3D4155',
        'text-muted': '#3D4155',
      },
      borderRadius: {
        card: '8px',
        input: '6px',
      },
      spacing: {
        'sidebar': '240px',
        'sidebar-collapsed': '56px',
        'topbar': '56px',
      },
    },
  },
  plugins: [],
};

export default config;
