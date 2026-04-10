/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your VYBE verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={logoBadge}>
          <span style={logoText}>VYBE</span>
        </div>
        <Heading style={h1}>Confirm your identity</Heading>
        <Text style={text}>Use this code to verify it's you:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code expires shortly. If you didn't request this, you can safely ignore it.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#ff3399',
  margin: '0 0 30px',
  letterSpacing: '4px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '32px 0 0' }
