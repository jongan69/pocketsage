/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#0a0a0a', secondary: '#141414', tertiary: '#1c1c1c' },
        accent: { DEFAULT: '#6366f1', muted: '#4338ca' },
        text: { primary: '#f5f5f5', secondary: '#a3a3a3', muted: '#525252' },
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
    },
  },
  plugins: [],
};
