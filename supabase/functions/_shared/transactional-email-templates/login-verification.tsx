/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { styles, BRAND } from '../email-templates/_styles.ts'

interface Props {
  code?: string
  ip?: string
  city?: string
  country?: string
  device?: string
}

const LoginVerificationEmail = ({ code = '000000', ip, city, country, device }: Props) => {
  const location = [city, country].filter(Boolean).join(', ') || 'Unknown location'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your VYBE login code is {code}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading style={styles.logoText}>VYBE</Heading>
            <Text style={styles.logoTagline}>Sign-in verification</Text>
          </Section>
          <Section style={styles.body}>
            <Heading style={styles.h1}>Your login code</Heading>
            <Text style={styles.text}>
              Enter this code in VYBE to finish signing in. It expires in 10 minutes.
            </Text>
            <div style={{
              margin: '24px 0',
              padding: '24px',
              borderRadius: '20px',
              background: BRAND.gradientSoft,
              border: `1px solid ${BRAND.borderStrong}`,
              textAlign: 'center' as const,
              fontSize: '36px',
              letterSpacing: '12px',
              fontWeight: 800,
              color: BRAND.text,
              fontFamily: 'monospace',
            }}>
              {code}
            </div>
            <Text style={{ ...styles.text, fontSize: '13px', color: BRAND.textMuted }}>
              Requested from <strong style={{ color: BRAND.text }}>{device || 'unknown device'}</strong>
              {ip ? ` (${ip})` : ''} — {location}.
            </Text>
            <Text style={{ ...styles.text, fontSize: '12px', color: BRAND.textFaint, marginTop: '24px' }}>
              If you didn't try to sign in, ignore this email and consider changing your password.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: LoginVerificationEmail,
  subject: (data: Record<string, any>) => `Your VYBE login code: ${data?.code ?? ''}`,
  displayName: 'Login verification code',
  previewData: { code: '482913', ip: '24.4.5.6', city: 'New York', country: 'US', device: 'iPhone — Safari' },
} satisfies TemplateEntry
