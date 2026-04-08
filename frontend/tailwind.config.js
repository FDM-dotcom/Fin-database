/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme (warm brown)
        'surface-dim': '#1c110b',
        'surface': '#1c110b',
        'surface-bright': '#453630',
        'surface-container-lowest': '#170c07',
        'surface-container-low': '#251913',
        'surface-container': '#2a1d17',
        'surface-container-high': '#352721',
        'surface-container-highest': '#40312b',
        'on-surface': '#f6ddd4',
        'on-surface-variant': '#e0c0b2',
        'outline': '#a88a7f',
        'outline-variant': '#594238',
        // Primary (orange)
        'primary': '#ffb595',
        'primary-container': '#f46c22',
        'on-primary': '#571e00',
        'on-primary-container': '#531c00',
        'primary-fixed': '#ffdbcd',
        'primary-fixed-dim': '#ffb595',
        // Secondary
        'secondary': '#ffb595',
        'secondary-container': '#723517',
        'on-secondary': '#552003',
        // Tertiary (blue)
        'tertiary': '#8ccdff',
        'tertiary-container': '#009ee4',
        'on-tertiary': '#00344e',
        'on-tertiary-container': '#00314a',
        // Error
        'error': '#ffb4ab',
        'error-container': '#93000a',
        'on-error': '#690005',
        // Background
        'background': '#1c110b',
        'on-background': '#f6ddd4',
        // Light theme overrides (used via CSS variables in light mode)
        'light-surface': '#fff8f6',
        'light-surface-container': '#ffe9e1',
        'light-surface-container-low': '#fff1ec',
        'light-surface-container-high': '#fce3da',
        'light-surface-container-highest': '#f6ddd4',
        'light-on-surface': '#251913',
        'light-primary': '#a23f00',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        lg: '0.25rem',
        xl: '0.5rem',
        full: '0.75rem',
      },
    },
  },
  plugins: [],
}
