/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
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
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirm email change ✉️</Heading>
          <Text style={styles.text}>
            You requested to change your VYBE email:
          </Text>
          <Section style={{
            background: BRAND.gradientSoft,
            border: `1px solid ${BRAND.border}`,
            borderRadius: '16px',
            padding: '18px 22px',
            margin: '0 0 28px',
          }}>
            <Text style={{ fontSize: '12px', color: BRAND.textFaint, margin: '0 0 4px', letterSpacing: '1px', textTransform: 'uppercase' as const, fontWeight: 700 }}>From</Text>
            <Text style={{ fontSize: '15px', color: BRAND.text, margin: '0 0 14px', fontWeight: 600 }}>{email}</Text>
            <Text style={{ fontSize: '12px', color: BRAND.textFaint, margin: '0 0 4px', letterSpacing: '1px', textTransform: 'uppercase' as const, fontWeight: 700 }}>To</Text>
            <Text style={{ fontSize: '15px', color: BRAND.primary, margin: 0, fontWeight: 600 }}>{newEmail}</Text>
          </Section>
          <Button style={styles.button} href={confirmationUrl}>
            Confirm Change
          </Button>
          <Text style={{ ...styles.hint, marginTop: '28px' }}>
            Didn't request this? Secure your account immediately.
          </Text>
        </Section>
        <Text style={styles.footer}>
          Keeping your account safe
          <span style={styles.footerBrand}>VYBEHUB.APP</span>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
