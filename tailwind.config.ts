import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        sea: "hsl(var(--sea) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        segment: "hsl(var(--segment))",
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        zinc: {
          950: "hsl(240 6% 4%)",
          900: "hsl(240 5% 8%)",
          800: "hsl(240 4% 16%)",
          700: "hsl(240 4% 24%)",
          600: "hsl(240 4% 36%)",
          500: "hsl(240 4% 46%)",
          400: "hsl(240 4% 58%)",
          300: "hsl(240 5% 72%)",
          200: "hsl(240 5% 86%)",
          100: "hsl(240 5% 94%)",
          50: "hsl(240 6% 97%)",
        },
        amber: {
          950: "hsl(38 90% 8%)",
          900: "hsl(38 90% 14%)",
          800: "hsl(38 92% 22%)",
          700: "hsl(38 92% 34%)",
          600: "hsl(38 92% 42%)",
          500: "hsl(38 92% 50%)",
          400: "hsl(38 90% 62%)",
          300: "hsl(38 88% 74%)",
          200: "hsl(38 85% 84%)",
          100: "hsl(38 80% 93%)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      boxShadow: {
        "glow-brand":
          "0 0 20px hsl(212 85% 48% / 0.15), 0 0 40px hsl(212 85% 48% / 0.05)",
        "glow-amber":
          "0 0 20px hsl(38 92% 50% / 0.15), 0 0 40px hsl(38 92% 50% / 0.05)",
        // Theme-aware: dark-mode strength is too heavy on light surfaces.
        card: "0 1px 3px hsl(var(--shadow) / var(--shadow-strength)), 0 1px 2px hsl(var(--shadow) / calc(var(--shadow-strength) * 0.75))",
        "card-hover":
          "0 4px 12px hsl(var(--shadow) / calc(var(--shadow-strength) * 1.25)), 0 2px 4px hsl(var(--shadow) / calc(var(--shadow-strength) * 0.75))",
        elevated:
          "0 8px 32px hsl(var(--shadow) / var(--shadow-strength)), 0 2px 8px hsl(var(--shadow) / calc(var(--shadow-strength) * 0.75))",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", opacity: "1" },
          "100%": { transform: "scale(1.3)", opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "pulse-ring": "pulse-ring 1.5s ease-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-brand":
          "linear-gradient(135deg, hsl(212 85% 48%), hsl(199 89% 48%))",
        "gradient-amber":
          "linear-gradient(135deg, hsl(38 92% 50%), hsl(28 92% 46%))",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
