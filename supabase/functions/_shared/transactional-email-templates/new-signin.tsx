/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { styles, BRAND } from '../email-templates/_styles.ts'

interface Props {
  device?: string
  ip?: string
  city?: string
  country?: string
  time?: string
  reviewUrl?: string
}

const NewSigninEmail = ({ device, ip, city, country, time, reviewUrl }: Props) => {
  const location = [city, country].filter(Boolean).join(', ') || 'Unknown location'
  const url = reviewUrl || 'https://vybehub.app/settings?tab=security'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>New sign-in to your VYBE account</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Heading style={styles.logoText}>VYBE</Heading>
            <Text style={styles.logoTagline}>Security alert</Text>
          </Section>
          <Section style={styles.body}>
            <Heading style={styles.h1}>New sign-in</Heading>
            <Text style={styles.text}>
              Your VYBE account was just signed into. Here are the details:
            </Text>
            <div style={{
              margin: '20px 0',
              padding: '18px 20px',
              borderRadius: '16px',
              background: BRAND.gradientFaint,
              border: `1px solid ${BRAND.border}`,
              color: BRAND.text,
              fontSize: '14px',
              lineHeight: '1.8',
            }}>
              <div><strong style={{ color: BRAND.textMuted }}>Device:</strong> {device || 'Unknown'}</div>
              <div><strong style={{ color: BRAND.textMuted }}>Location:</strong> {location}</div>
              {ip ? <div><strong style={{ color: BRAND.textMuted }}>IP:</strong> {ip}</div> : null}
              {time ? <div><strong style={{ color: BRAND.textMuted }}>When:</strong> {time}</div> : null}
            </div>
            <Text style={styles.text}>
              If this was you, no action needed. If not, review your sessions and revoke access right now.
            </Text>
            <Button style={styles.button} href={url}>
              Review activity ›
            </Button>
            <Text style={{ ...styles.text, fontSize: '12px', color: BRAND.textFaint, marginTop: '24px' }}>
              You're getting this because new sign-in alerts are on. Manage in Settings → Privacy & Security.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: NewSigninEmail,
  subject: 'New sign-in to your VYBE account',
  displayName: 'New sign-in alert',
  previewData: { device: 'iPhone 15 — Safari', ip: '24.4.5.6', city: 'New York', country: 'US', time: 'Just now' },
} satisfies TemplateEntry
