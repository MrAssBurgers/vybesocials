/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles, BRAND } from './_styles.ts'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your VYBE password — secure link inside</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.headerDots}>● ● ●</Text>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Hr style={styles.divider} />
        <Section style={styles.body}>
          <Heading style={styles.h1}>Reset incoming 🔑</Heading>
          <Section style={styles.chipRow}>
            <span style={styles.chipAccent}>● Password Reset</span>
            <span style={styles.chip}>Secure</span>
            <span style={styles.chip}>One-time</span>
          </Section>
          <Text style={styles.text}>
            We received a request to reset your VYBE password. Tap below to choose a new one.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Reset Password ›
          </Button>
          <Section style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${BRAND.border}`,
            borderRadius: '14px',
            padding: '16px 18px',
            margin: '32px 0 24px',
          }}>
            <Text style={{ fontSize: '11px', color: BRAND.textMuted, margin: '0 0 8px', letterSpacing: '1.5px', textTransform: 'uppercase' as const, fontWeight: 700 }}>
              <span style={{ color: BRAND.primary }}>●</span> Security tips
            </Text>
            <Text style={{ fontSize: '13px', color: BRAND.textFaint, lineHeight: 1.7, margin: 0 }}>
              <span style={{ color: BRAND.primary }}>›</span> Use 12+ characters with mixed case<br/>
              <span style={{ color: BRAND.primary }}>›</span> Don't reuse passwords from other apps<br/>
              <span style={{ color: BRAND.primary }}>›</span> Enable 2FA in settings after reset
            </Text>
          </Section>
          <Text style={styles.hint}>
            Didn't request this? You can safely ignore this email — your password won't change.
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

export default RecoveryEmail
