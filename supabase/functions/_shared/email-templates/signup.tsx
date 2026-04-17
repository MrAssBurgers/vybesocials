/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl }: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to VYBE — confirm your email to get started</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>Welcome aboard ✨</Heading>
          <Text style={styles.text}>
            Thanks for joining{' '}
            <Link href={siteUrl} style={styles.link}>VYBE</Link>. Confirm your email{' '}
            <span style={{ color: '#F4F4F8', fontWeight: 600 }}>{recipient}</span>{' '}
            to unlock your account.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Verify Email
          </Button>
          <Text style={{ ...styles.hint, marginTop: '28px' }}>
            Didn't create an account? You can safely ignore this email.
          </Text>
        </Section>
        <Text style={styles.footer}>
          Sent with ✨ by the VYBE team
          <span style={styles.footerBrand}>VYBEHUB.APP</span>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
