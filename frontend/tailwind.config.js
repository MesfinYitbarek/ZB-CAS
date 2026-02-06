/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Zemen Bank Brand Colors (per document: red, white, black - more red and white)
        brand: {
          red: '#C8102E',
          'red-dark': '#A00D24',
          'red-light': '#E8283F',
          'red-muted': '#F5E5E7',
          black: '#1A1A1A',
          'black-soft': '#27272A',
        },
        // Competency Level Colors
        level: {
          basic: '#F59E0B',
          intermediate: '#EA580C',
          advanced: '#2563EB',
          expert: '#16A34A',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.10)',
      },
    },
  },
  plugins: [],
}
