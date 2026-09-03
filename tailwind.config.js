/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.html', './public/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        heading: ['"Outfit"', 'sans-serif']
      },
      colors: {
        brand: {
          50: '#fff1f2',
          100: '#ffe4e6',
          500: '#f2545b',
          600: '#e11d48',
          700: '#be123c',
          900: '#881337'
        }
      }
    }
  },
  plugins: []
};
