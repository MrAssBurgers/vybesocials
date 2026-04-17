/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Column, Container, Head, Heading, Hr, Html, Preview, Row, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { styles, BRAND } from '../email-templates/_styles.ts'

const SITE_URL = 'https://vybehub.app'

interface WelcomeEmailProps {
  name?: string
}

const WelcomeEmail = ({ name }: WelcomeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to VYBE — your vibe starts now ✨</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.headerDots}>● ● ●</Text>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Hr style={styles.divider} />
        <Section style={styles.body}>
          <Heading style={styles.h1}>
            {name ? `Your VYBE starts now, ${name} 🎉` : 'Your VYBE starts now 🎉'}
          </Heading>
          <Section style={styles.chipRow}>
            <span style={styles.chipAccent}>● Welcome</span>
            <span style={styles.chip}>Account Active</span>
            <span style={styles.chip}>Day 1</span>
          </Section>
          <Text style={styles.text}>
            You're in. Build your identity, share your VYBE, and connect with people who actually get you.
          </Text>
          <Button style={styles.button} href={SITE_URL}>
            Open VYBE ›
          </Button>
          <Text style={{ fontSize: '11px', color: BRAND.textMuted, letterSpacing: '1.5px', textTransform: 'uppercase' as const, fontWeight: 700, margin: '36px 0 14px', textAlign: 'center' as const }}>
            <span style={{ color: BRAND.primary }}>●</span> Quick start
          </Text>
          <Row style={{ margin: '0 0 28px' }}>
            <Column style={styles.featureTile}>
              <Text style={styles.featureEmoji}>👤</Text>
              <Text style={styles.featureLabel}>Set up profile</Text>
            </Column>
            <Column style={{ width: '2%' }}>&nbsp;</Column>
            <Column style={styles.featureTile}>
              <Text style={styles.featureEmoji}>🤝</Text>
              <Text style={styles.featureLabel}>Find friends</Text>
            </Column>
            <Column style={{ width: '2%' }}>&nbsp;</Column>
            <Column style={styles.featureTile}>
              <Text style={styles.featureEmoji}>📸</Text>
              <Text style={styles.featureLabel}>Drop a vybe</Text>
            </Column>
          </Row>
          <Text style={{ ...styles.hint, marginTop: '4px' }}>
            Need help getting started? Just reply to this email — we're here.
          </Text>
        </Section>
        <Text style={styles.footerNav}>
          Help<span style={styles.footerNavSep}>·</span>Privacy<span style={styles.footerNavSep}>·</span>Status
        </Text>
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
