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
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
        display: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Source Serif 4', 'Georgia', 'serif'],
      },
      colors: {
        /* Map existing Tailwind color names to CSS custom properties */
        primary: 'var(--bg-base)',
        background: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        'surface-alt': 'var(--bg-surface-sunken)',
        'surface-raised': 'var(--bg-surface-raised)',
        elevated: 'var(--bg-surface-raised)',
        hover: 'var(--bg-table-row-hover)',
        input: 'var(--bg-surface-sunken)',
        border: {
          DEFAULT: 'var(--border-default)',
          light: 'var(--border-subtle)',
          focus: 'var(--border-focus)',
        },
        accent: {
          DEFAULT: 'var(--interactive-primary)',
          dim: 'color-mix(in srgb, var(--interactive-primary) 10%, transparent)',
          contrast: '#ffffff',
          hover: 'var(--interactive-primary-hover)',
        },
        certified: {
          DEFAULT: 'var(--cert-gold)',
          dim: 'color-mix(in srgb, var(--cert-gold) 10%, transparent)',
        },
        status: {
          green: 'var(--status-success)',
          'green-dim': 'var(--status-success-bg)',
          amber: 'var(--status-warning)',
          'amber-dim': 'var(--status-warning-bg)',
          red: 'var(--status-error)',
          'red-dim': 'var(--status-error-bg)',
          blue: 'var(--status-info)',
          'blue-dim': 'var(--status-info-bg)',
        },
        ai: {
          purple: 'var(--ai-primary)',
          'purple-dim': 'var(--ai-bg)',
          'purple-border': 'var(--ai-border)',
        },
        equity: {
          DEFAULT: 'var(--ai-primary)',
          dim: 'var(--ai-bg)',
        },
      },
      textColor: {
        primary: 'var(--text-primary)',
        'text-primary': 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        'text-secondary': 'var(--text-secondary)',
        tertiary: 'var(--text-tertiary)',
        'text-tertiary': 'var(--text-tertiary)',
        muted: 'var(--text-tertiary)',
        'text-muted': 'var(--text-tertiary)',
      },
      borderRadius: {
        card: 'var(--radius-lg)',
        input: 'var(--radius-md)',
      },
      spacing: {
        'sidebar': '240px',
        'sidebar-collapsed': '64px',
        'topbar': '56px',
      },
      boxShadow: {
        'card': 'var(--shadow-sm)',
        'card-hover': 'var(--shadow-md)',
        'glow-accent': '0 0 20px color-mix(in srgb, var(--interactive-primary) 15%, transparent)',
        'glow-green': '0 0 20px color-mix(in srgb, var(--status-success) 15%, transparent)',
        'glow-gold': '0 0 30px color-mix(in srgb, var(--cert-gold) 20%, transparent)',
      },
    },
  },
  plugins: [],
};

export default config;
