/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your VYBE password</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={logoBadge}>
          <span style={logoText}>VYBE</span>
        </div>
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          We received a request to reset your VYBE password. Click below to choose a new one.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Reset Password
        </Button>
        <Text style={footer}>
          If you didn't request this, you can safely ignore this email. Your password won't change.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

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
