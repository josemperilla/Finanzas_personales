/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        space: '#0a0f1e',
        indigo: { DEFAULT: '#6366f1', glow: 'rgba(99,102,241,0.4)' },
        violet: '#8b5cf6',
      },
      fontFamily: {
        // Debe coincidir con las variables --font-* de src/index.css y los fonts cargados en index.html
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
