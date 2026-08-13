/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        iron: { 950: 'var(--iron-950)', 700: 'var(--iron-700)', 400: 'var(--iron-400)', 200: 'var(--iron-200)' },
        bone: { 50: 'var(--bone-50)', 0: 'var(--bone-0)' },
        verde: { 600: 'var(--verde-600)', 700: 'var(--verde-700)', 100: 'var(--verde-100)' },
        ember: { 500: 'var(--ember-500)', 600: 'var(--ember-600)' },
        signal: { 600: 'var(--signal-red-600)' },
        surface: 'var(--surface)', surface2: 'var(--surface-2)',
        ink: 'var(--ink)', muted: 'var(--muted)', faint: 'var(--faint)', line: 'var(--line)',
      },
      fontFamily: {
        display: ['"Inter Tight"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { ctl: '6px', card: '10px' },
      fontSize: { '2xs': ['12px', '16px'], xs: ['13px', '18px'], sm: ['14px', '21px'], base: ['16px', '24px'], lg: ['18px', '26px'], xl: ['22px', '28px'] },
    },
  },
  plugins: [],
}
