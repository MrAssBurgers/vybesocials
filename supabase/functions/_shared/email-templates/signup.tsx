/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to VYBE — confirm your email</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={logoBadge}>
          <span style={logoText}>VYBE</span>
        </div>
        <Heading style={h1}>Welcome aboard!</Heading>
        <Text style={text}>
          Thanks for joining{' '}
          <Link href={siteUrl} style={link}>
            <strong>VYBE</strong>
          </Link>
          ! Confirm your email (
          <Link href={`mailto:${recipient}`} style={link}>
            {recipient}
          </Link>
          ) to get started.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Verify Email
        </Button>
        <Text style={footer}>
          If you didn't create an account, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

const main = { backgroundColor: '#ffffff', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }
const container = { padding: '40px 25px', maxWidth: '480px', margin: '0 auto' }
const logoBadge = {
  display: 'inline-block' as const,
  padding: '10px 18px',
  background: 'linear-gradient(135deg, #ff3399, #cc0066)',
  borderRadius: '14px',
  marginBottom: '24px',
}
const logoText = {
  color: '#ffffff',
  fontSize: '20px',
  fontWeight: '800' as const,
  letterSpacing: '2px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#0a0a12',
  margin: '0 0 16px',
}
const text = {
  fontSize: '14px',
  color: '#7a7a8a',
  lineHeight: '1.6',
  margin: '0 0 28px',
}
const link = { color: '#ff3399', textDecoration: 'underline' }
const button = {
  backgroundColor: '#ff3399',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: '600' as const,
  borderRadius: '12px',
  padding: '14px 28px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0' }
