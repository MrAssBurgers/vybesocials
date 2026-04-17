/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'vybeapp'
const SITE_URL = 'https://vybehub.app'

interface WelcomeEmailProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to {SITE_NAME} — your VYBE starts here</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={hero}>
          <Heading style={h1}>
            {name ? `Welcome, ${name}!` : 'Welcome to VYBE!'}
          </Heading>
          <Text style={text}>
            You're in. Build your identity, share your VYBE, and connect with people who get you.
          </Text>
          <Button style={button} href={SITE_URL}>
            Open VYBE
          </Button>
        </Section>
        <Text style={footer}>— The {SITE_NAME} team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeEmail,
  subject: 'Welcome to VYBE',
  displayName: 'Welcome email',
  previewData: { name: 'Jordan' },
} satisfies TemplateEntry

const main: React.CSSProperties = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}
const container: React.CSSProperties = { padding: '32px 24px', maxWidth: '560px' }
const hero: React.CSSProperties = {
  background: 'linear-gradient(135deg, #8B5CF6 0%, #06B6D4 100%)',
  borderRadius: '16px',
  padding: '32px 24px',
  textAlign: 'center' as const,
}
const h1: React.CSSProperties = {
  fontSize: '26px',
  fontWeight: 700,
  color: '#ffffff',
  margin: '0 0 12px',
}
const text: React.CSSProperties = {
  fontSize: '15px',
  color: 'rgba(255,255,255,0.92)',
  lineHeight: 1.5,
  margin: '0 0 24px',
}
const button: React.CSSProperties = {
  backgroundColor: '#0B0B10',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '12px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}
const footer: React.CSSProperties = {
  fontSize: '12px',
  color: '#999999',
  textAlign: 'center' as const,
  margin: '24px 0 0',
}
