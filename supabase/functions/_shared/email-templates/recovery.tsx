/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your VYBE password</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Reset your password 🔑</Heading>
          <Text style={styles.text}>
            We received a request to reset your VYBE password. Tap below to choose a new one.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Reset Password
          </Button>
          <Text style={{ ...styles.hint, marginTop: '28px' }}>
            Didn't request this? You can safely ignore this email — your password won't change.
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

export default RecoveryEmail
