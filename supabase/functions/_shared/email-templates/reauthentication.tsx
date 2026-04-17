/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your VYBE verification code — confirm it's you</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.headerDots}>● ● ●</Text>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Hr style={styles.divider} />
        <Section style={styles.body}>
          <Heading style={styles.h1}>Confirm it's you 🛡️</Heading>
          <Section style={styles.chipRow}>
            <span style={styles.chipAccent}>● Verification</span>
            <span style={styles.chip}>One-time Code</span>
            <span style={styles.chip}>5 min</span>
          </Section>
          <Text style={styles.text}>
            Use the code below to verify your identity:
          </Text>
          <Section style={styles.codeBox}>
            <Text style={styles.codeText}>{token}</Text>
          </Section>
          <Text style={styles.hint}>
            This code expires shortly. If you didn't request this, you can safely ignore it — no changes will be made.
          </Text>
        </Section>
        <Text style={styles.footerNav}>
          Help<span style={styles.footerNavSep}>·</span>Privacy<span style={styles.footerNavSep}>·</span>Status
        </Text>
        <Text style={styles.footer}>
          Protecting your VYBE
          <span style={styles.footerBrand}>VYBEHUB.APP</span>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
