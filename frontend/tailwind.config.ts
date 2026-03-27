import type { Config } from 'tailwindcss';

/**
 * Sabit Tailwind Configuration — Ledger Palette
 * Binding source: Sabit_design_system.md
 *
 * Rule 4: No #FFFFFF. All colors via CSS custom properties or Ledger palette hex.
 * Agency model: ink-blue = Sabit acted, forest = human confirmed.
 */
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
        display: ['var(--font-serif)', 'DM Serif Display', 'Georgia', 'serif'],
        serif: ['var(--font-serif)', 'DM Serif Display', 'Georgia', 'serif'],
      },
      colors: {
        /* Ledger palette — base surfaces */
        ledger: {
          50:  '#F5F0E8',
          100: '#EDE6D6',
          200: '#DDD5C2',
          400: '#8B7A5E',
          600: '#5C4F3A',
          900: '#2C2416',
        },
        /* Semantic accent colors */
        gold:         '#B8860B',
        'gold-bg':    '#F5EDD0',
        forest:       '#2D6A4F',
        'forest-bg':  '#E0EDE8',
        amber:        '#8B6914',
        'amber-bg':   '#F0E8D0',
        rust:         '#C44B2B',
        'rust-bg':    '#F5E4DE',
        'ink-blue':   '#3B6EA5',
        'ink-blue-bg': '#E0EAF5',

        /* Map to CSS custom properties for existing components */
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
          contrast: '#F5F0E8', /* ledger-50, NOT white */
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
        /* AI is ink-blue (Sabit acted), not purple */
        ai: {
          DEFAULT: 'var(--ai-primary)',
          dim: 'var(--ai-bg)',
          border: 'var(--ai-border)',
          /* Legacy aliases */
          purple: 'var(--ai-primary)',
          'purple-dim': 'var(--ai-bg)',
          'purple-border': 'var(--ai-border)',
        },
        equity: {
          DEFAULT: 'var(--ai-primary)',
          dim: 'var(--ai-bg)',
        },
      },
      backgroundColor: {
        page: '#F5F0E8',
        surface: '#EDE6D6',
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
