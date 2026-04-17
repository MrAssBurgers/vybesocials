/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles, BRAND } from './_styles.ts'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({ siteName, email, newEmail, confirmationUrl }: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your VYBE email change</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.headerDots}>● ● ●</Text>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Hr style={styles.divider} />
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirm email change ✉️</Heading>
          <Section style={styles.chipRow}>
            <span style={styles.chipAccent}>● Account Update</span>
            <span style={styles.chip}>Verify</span>
            <span style={styles.chip}>Secure</span>
          </Section>
          <Text style={styles.text}>
            You requested to change your VYBE email address:
          </Text>
          <Section style={{
            background: BRAND.gradientSoft,
            border: `1px solid rgba(255,51,153,0.25)`,
            borderRadius: '18px',
            padding: '20px 22px',
            margin: '0 0 28px',
            boxShadow: '0 0 30px rgba(255,51,153,0.10), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}>
            <Text style={{ fontSize: '10px', color: BRAND.textFaint, margin: '0 0 4px', letterSpacing: '2px', textTransform: 'uppercase' as const, fontWeight: 800 }}>From</Text>
            <Text style={{ fontSize: '15px', color: BRAND.textMuted, margin: '0 0 12px', fontWeight: 600, textDecoration: 'line-through' as const }}>{email}</Text>
            <Text style={{ fontSize: '14px', color: BRAND.primary, margin: '0 0 12px', fontWeight: 800, letterSpacing: '2px' }}>↓</Text>
            <Text style={{ fontSize: '10px', color: BRAND.textFaint, margin: '0 0 4px', letterSpacing: '2px', textTransform: 'uppercase' as const, fontWeight: 800 }}>To</Text>
            <Text style={{ fontSize: '15px', color: BRAND.text, margin: 0, fontWeight: 700 }}>{newEmail}</Text>
          </Section>
          <Button style={styles.button} href={confirmationUrl}>
            Confirm Change ›
          </Button>
          <Text style={{ ...styles.hint, marginTop: '32px' }}>
            Didn't request this? Secure your account immediately by resetting your password.
          </Text>
        </Section>
        <Text style={styles.footerNav}>
          Help<span style={styles.footerNavSep}>·</span>Privacy<span style={styles.footerNavSep}>·</span>Status
        </Text>
        <Text style={styles.footer}>
          Keeping your account safe
          <span style={styles.footerBrand}>VYBEHUB.APP</span>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
