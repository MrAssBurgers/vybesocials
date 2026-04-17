/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your VYBE login link is ready</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Your login link 🔐</Heading>
          <Text style={styles.text}>
            Tap the button below to sign in to VYBE. This link expires shortly for your security.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Log in to VYBE
          </Button>
          <Text style={{ ...styles.hint, marginTop: '28px' }}>
            If you didn't request this link, you can safely ignore this email.
          </Text>
        </Section>
        <Text style={styles.footer}>
          Stay in your VYBE
          <span style={styles.footerBrand}>VYBEHUB.APP</span>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
