// ============================================================
// Finanzas — Design Tokens para Tailwind CSS
// Pega esto dentro de theme.extend en tu tailwind.config.js
// ============================================================
module.exports = {
  theme: {
    extend: {
      colors: {
        blue: {
          50: '#eff6ff', 100: '#dbeafe', 300: '#bfd4fb',
          500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
        },
        orange: {
          50: '#fff7ed', 100: '#ffedd5',
          400: '#fb923c', 500: '#f97316', 600: '#ea580c',
        },
        ink: { DEFAULT: '#0f172a', 2: '#1e293b' },
        muted: { DEFAULT: '#64748b', 2: '#94a3b8' },
        line: '#e9eef5',
        surface: '#f6f8fc',
      },
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        md: '14px', lg: '16px', xl: '20px', '2xl': '24px',
      },
      boxShadow: {
        card: '0 10px 30px rgba(15,23,42,0.05)',
        blue: '0 8px 20px rgba(29,78,216,0.28)',
        orange: '0 8px 20px rgba(249,115,22,0.30)',
        float: '0 24px 50px rgba(15,23,42,0.16)',
      },
      backgroundImage: {
        'grad-brand': 'linear-gradient(150deg, #1d4ed8, #2563eb 60%, #1e40af)',
        'grad-card': 'linear-gradient(125deg, #1d4ed8 0%, #2563eb 45%, #f97316 130%)',
        'grad-accent': 'linear-gradient(90deg, #2563eb, #f97316)',
      },
    },
  },
};
