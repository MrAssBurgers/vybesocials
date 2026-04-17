/// <reference types="npm:@types/react@18.3.1" />
import type * as React from 'npm:react@18.3.1'

// Shared VYBE email design tokens.
// Email clients can't read app CSS vars, so we hardcode the VYBE brand palette
// to match the in-app dark aesthetic (Deep Navy + neon pink/violet/cyan).

export const BRAND = {
  bg: '#0A0A12',
  card: '#15151F',
  border: 'rgba(255,255,255,0.08)',
  text: '#F4F4F8',
  textMuted: '#9A9AAE',
  textFaint: '#6B6B7E',
  primary: '#FF3399',
  gradient: 'linear-gradient(135deg, #FF3399 0%, #A855F7 50%, #06B6D4 100%)',
  gradientSoft: 'linear-gradient(135deg, rgba(255,51,153,0.18) 0%, rgba(168,85,247,0.12) 50%, rgba(6,182,212,0.10) 100%)',
}

export const styles: Record<string, React.CSSProperties> = {
  main: {
    backgroundColor: BRAND.bg,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    margin: 0,
    padding: '32px 16px',
  },
  container: {
    maxWidth: '520px',
    margin: '0 auto',
    backgroundColor: BRAND.card,
    borderRadius: '24px',
    border: `1px solid ${BRAND.border}`,
    overflow: 'hidden',
  },
  header: {
    background: BRAND.gradient,
    padding: '32px 32px 28px',
    textAlign: 'center' as const,
  },
  logoText: {
    color: '#ffffff',
    fontSize: '28px',
    fontWeight: 900,
    letterSpacing: '6px',
    margin: 0,
    textShadow: '0 2px 12px rgba(0,0,0,0.25)',
  },
  logoTagline: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: '11px',
    letterSpacing: '3px',
    textTransform: 'uppercase' as const,
    margin: '6px 0 0',
    fontWeight: 600,
  },
  body: { padding: '36px 32px 8px' },
  h1: {
    fontSize: '24px',
    fontWeight: 700,
    color: BRAND.text,
    margin: '0 0 14px',
    letterSpacing: '-0.01em',
    lineHeight: 1.25,
  },
  text: {
    fontSize: '15px',
    color: BRAND.textMuted,
    lineHeight: 1.6,
    margin: '0 0 28px',
  },
  link: {
    color: BRAND.primary,
    textDecoration: 'none',
    fontWeight: 600,
  },
  button: {
    background: BRAND.gradient,
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 700,
    borderRadius: '14px',
    padding: '14px 32px',
    textDecoration: 'none',
    display: 'inline-block',
    letterSpacing: '0.02em',
  },
  codeBox: {
    background: BRAND.gradientSoft,
    border: `1px solid ${BRAND.border}`,
    borderRadius: '16px',
    padding: '22px 24px',
    textAlign: 'center' as const,
    margin: '0 0 28px',
  },
  codeText: {
    fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace",
    fontSize: '32px',
    fontWeight: 800,
    color: BRAND.text,
    letterSpacing: '8px',
    margin: 0,
  },
  hint: {
    fontSize: '13px',
    color: BRAND.textFaint,
    lineHeight: 1.6,
    margin: '0 0 28px',
  },
  footer: {
    fontSize: '12px',
    color: BRAND.textFaint,
    lineHeight: 1.6,
    margin: 0,
    textAlign: 'center' as const,
    padding: '20px 32px 28px',
    borderTop: `1px solid ${BRAND.border}`,
  },
  footerBrand: {
    fontSize: '10px',
    color: BRAND.textFaint,
    letterSpacing: '2px',
    textTransform: 'uppercase' as const,
    margin: '10px 0 0',
    textAlign: 'center' as const,
    fontWeight: 700,
  },
}
