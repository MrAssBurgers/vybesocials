/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles, BRAND } from './_styles.ts'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, siteUrl, recipient, confirmationUrl }: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Activate your VYBE — your social, your vibe starts now</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.headerDots}>● ● ●</Text>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Hr style={styles.divider} />
        <Section style={styles.body}>
          <Heading style={styles.h1}>Activate your VYBE ✨</Heading>
          <Section style={styles.chipRow}>
            <span style={styles.chipAccent}>● New Account</span>
            <span style={styles.chip}>Secure</span>
            <span style={styles.chip}>2 min</span>
          </Section>
          <Text style={styles.text}>
            You're seconds away from joining{' '}
            <Link href={siteUrl} style={styles.link}>VYBE</Link>. Confirm{' '}
            <span style={{ color: BRAND.text, fontWeight: 600 }}>{recipient}</span>{' '}
            to unlock your account.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Activate Account ›
          </Button>
          <Section style={{ ...styles.stepStrip, marginTop: '32px' }}>
            <span style={{ color: BRAND.primary }}>① Verify</span>
            <span style={{ margin: '0 10px', color: BRAND.textFaint }}>—</span>
            <span>② Personalize</span>
            <span style={{ margin: '0 10px', color: BRAND.textFaint }}>—</span>
            <span>③ Vibe</span>
          </Section>
          <Text style={styles.hint}>
            Didn't create an account? You can safely ignore this email.
          </Text>
        </Section>
        <Text style={styles.footerNav}>
          Help<span style={styles.footerNavSep}>·</span>Privacy<span style={styles.footerNavSep}>·</span>Status
        </Text>
        <Text style={styles.footer}>
          Sent with ✨ by the VYBE team
          <span style={styles.footerBrand}>VYBEHUB.APP</span>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
