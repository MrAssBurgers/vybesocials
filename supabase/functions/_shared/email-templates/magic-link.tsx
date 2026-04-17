/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your VYBE login link is ready — instant access</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.headerDots}>● ● ●</Text>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Hr style={styles.divider} />
        <Section style={styles.body}>
          <Heading style={styles.h1}>Instant access 🔐</Heading>
          <Section style={styles.chipRow}>
            <span style={styles.chipAccent}>● Magic Link</span>
            <span style={styles.chip}>Encrypted</span>
            <span style={styles.chip}>10 min</span>
          </Section>
          <Text style={styles.text}>
            Tap below to sign in to VYBE. This secure link is one-tap, no password required.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Log in to VYBE ›
          </Button>
          <Text style={{ ...styles.hint, marginTop: '32px' }}>
            If you didn't request this link, you can safely ignore this email — no action needed.
          </Text>
        </Section>
        <Text style={styles.footerNav}>
          Help<span style={styles.footerNavSep}>·</span>Privacy<span style={styles.footerNavSep}>·</span>Status
        </Text>
        <Text style={styles.footer}>
          Stay in your VYBE
          <span style={styles.footerBrand}>VYBEHUB.APP</span>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
