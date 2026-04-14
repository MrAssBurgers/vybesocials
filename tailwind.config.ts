import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
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
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
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
        neon: {
          pink: "hsl(var(--neon-pink))",
          purple: "hsl(var(--neon-purple))",
          cyan: "hsl(var(--neon-cyan))",
          yellow: "hsl(var(--neon-yellow))",
        },
        brand: {
          gold: "hsl(var(--brand-gold))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)", filter: "blur(4px)" },
          to: { opacity: "1", transform: "translateY(0)", filter: "blur(0px)" },
        },
        "fade-out": {
          from: { opacity: "1", transform: "translateY(0)", filter: "blur(0px)" },
          to: { opacity: "0", transform: "translateY(8px)", filter: "blur(4px)" },
        },
        "scale-in": {
          from: { transform: "scale(0.97)", opacity: "0", filter: "blur(2px)" },
          to: { transform: "scale(1)", opacity: "1", filter: "blur(0px)" },
        },
        "slide-up": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        "slide-down": {
          from: { transform: "translateY(0)", opacity: "1" },
          to: { transform: "translateY(100%)", opacity: "0" },
        },
        "heart-pop": {
          "0%": { transform: "scale(1)" },
          "30%": { transform: "scale(1.25)" },
          "60%": { transform: "scale(0.95)" },
          "80%": { transform: "scale(1.05)" },
          "100%": { transform: "scale(1)" },
        },
        "gradient-shift": {
          from: { backgroundPosition: "0% 50%" },
          to: { backgroundPosition: "-33.333% 50%" },
        },
        spin: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "bubble-pop-in": {
          "0%": { opacity: "0", transform: "scale(0.6)", filter: "blur(4px)" },
          "70%": { opacity: "1", transform: "scale(1.01)", filter: "blur(0px)" },
          "100%": { opacity: "1", transform: "scale(1)", filter: "blur(0px)" },
        },
        "bubble-pop-out": {
          "0%": { opacity: "1", transform: "scale(1)", filter: "blur(0px)" },
          "100%": { opacity: "0", transform: "scale(0.6)", filter: "blur(4px)" },
        },
        "opacity-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "opacity-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "slide-out-right": {
          from: { transform: "translateX(0)", opacity: "1" },
          to: { transform: "translateX(100%)", opacity: "0" },
        },
        "slide-in-left": {
          from: { transform: "translateX(-100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "slide-in-bottom": {
          from: { transform: "translateY(16px)", opacity: "0", filter: "blur(2px)" },
          to: { transform: "translateY(0)", opacity: "1", filter: "blur(0px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        "accordion-up": "accordion-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-out": "fade-out 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        "scale-in": "scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-up": "slide-up 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-down": "slide-down 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        "heart-pop": "heart-pop 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "gradient": "gradient-shift 6s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        spin: "spin 1s linear infinite",
        "bubble-pop-in": "bubble-pop-in 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        "bubble-pop-out": "bubble-pop-out 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-in-right": "slide-in-right 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-out-right": "slide-out-right 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        "slide-in-left": "slide-in-left 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
        "slide-in-bottom": "slide-in-bottom 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
