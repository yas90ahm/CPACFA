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
        primary: '#0f1629',
        background: '#0f1629',
        surface: '#1a2035',
        'surface-alt': '#1e2540',
        elevated: '#242b3d',
        hover: '#2d3548',
        input: '#141a2e',
        border: {
          DEFAULT: '#2d3548',
          light: '#242b3d',
          focus: '#6366f1',
        },
        accent: {
          DEFAULT: '#6366f1',
          dim: 'rgba(99,102,241,0.12)',
          contrast: '#ffffff',
        },
        certified: {
          DEFAULT: '#eab308',
          dim: 'rgba(234,179,8,0.12)',
        },
        status: {
          green: '#22c55e',
          'green-dim': 'rgba(34,197,94,0.12)',
          amber: '#f59e0b',
          'amber-dim': 'rgba(245,158,11,0.12)',
          red: '#ef4444',
          'red-dim': 'rgba(239,68,68,0.12)',
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
        primary: '#ffffff',
        'text-primary': '#ffffff',
        secondary: '#8892a7',
        'text-secondary': '#8892a7',
        tertiary: '#5a6478',
        'text-tertiary': '#5a6478',
        muted: '#3d4555',
        'text-muted': '#3d4555',
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
