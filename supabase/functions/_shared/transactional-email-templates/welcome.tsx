/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { styles } from '../email-templates/_styles.ts'

const SITE_URL = 'https://vybehub.app'

interface WelcomeEmailProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to VYBE — your vibe starts here</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>
            {name ? `Welcome, ${name}! 🎉` : 'Welcome to VYBE 🎉'}
          </Heading>
          <Text style={styles.text}>
            You're in. Build your identity, share your VYBE, and connect with people who get you.
          </Text>
          <Button style={styles.button} href={SITE_URL}>
            Open VYBE
          </Button>
          <Text style={{ ...styles.hint, marginTop: '28px' }}>
            Need help getting started? Just reply to this email — we're here.
          </Text>
        </Section>
        <Text style={styles.footer}>
          — The VYBE team
          <span style={styles.footerBrand}>VYBEHUB.APP</span>
        </Text>
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
