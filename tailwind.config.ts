import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './modules/panel/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        tertiary: {
          DEFAULT: '#2dd4bf',
          foreground: '#004a41',
          container: '#134e4a',
          'on-container': '#5eead4',
        },
        surface: {
          DEFAULT: 'hsl(var(--background))',
          bright: '#2c2c2c',
          container: {
            lowest: '#000000',
            low: '#131313',
            DEFAULT: '#191a1a',
            high: '#202020',
            highest: '#262626',
          },
          variant: '#262626',
        },
        'on-surface': {
          DEFAULT: '#e7e5e4',
          variant: '#acabaa',
        },
        outline: {
          DEFAULT: '#767575',
          variant: '#484848',
        },
        error: {
          DEFAULT: '#f97386',
          container: '#871c34',
        },
      },
      borderRadius: {
        none: '0',
        DEFAULT: '0',
        sm: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
      },
    },
  },
  plugins: [],
};

export default config;
