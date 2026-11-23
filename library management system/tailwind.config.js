/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#182b26',
        muted: '#71817a',
        canvas: '#f5f7f4',
        forest: '#246b52',
        lime: '#d9ee79',
      },
      fontFamily: {
        display: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      boxShadow: {
        card: '0 12px 35px rgba(27, 55, 43, .06)',
      },
    },
  },
  plugins: [],
}
