/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'dark': {
          900: '#0a0a0f',
          800: '#0d0d14',
          700: '#14141f',
          600: '#1a1a2e',
        }
      },
      fontFamily: {
        'mono': ['JetBrains Mono', 'SF Mono', 'Monaco', 'monospace'],
      }
    },
  },
  plugins: [],
}
