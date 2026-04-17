/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Column, Container, Head, Heading, Hr, Html, Link, Preview, Row, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles, BRAND } from './_styles.ts'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join VYBE — your spot is reserved</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Text style={styles.headerDots}>● ● ●</Text>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Hr style={styles.divider} />
        <Section style={styles.body}>
          <Heading style={styles.h1}>You're on the list 💫</Heading>
          <Section style={styles.chipRow}>
            <span style={styles.chipAccent}>● Invite</span>
            <span style={styles.chip}>Reserved Spot</span>
            <span style={styles.chip}>Limited</span>
          </Section>
          <Text style={styles.text}>
            Someone wants you on{' '}
            <Link href={siteUrl} style={styles.link}>VYBE</Link>. Accept your invite and start sharing your vibe with the people who get you.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Accept Invitation ›
          </Button>
          <Text style={{ fontSize: '11px', color: BRAND.textMuted, letterSpacing: '1.5px', textTransform: 'uppercase' as const, fontWeight: 700, margin: '36px 0 14px', textAlign: 'center' as const }}>
            <span style={{ color: BRAND.primary }}>●</span> What's inside
          </Text>
          <Row style={{ margin: '0 0 28px' }}>
            <Column style={{ ...styles.featureTile, paddingRight: '12px' } as React.CSSProperties}>
              <Text style={styles.featureEmoji}>💬</Text>
              <Text style={styles.featureLabel}>Chat</Text>
            </Column>
            <Column style={{ width: '2%' }}>&nbsp;</Column>
            <Column style={styles.featureTile}>
              <Text style={styles.featureEmoji}>🎵</Text>
              <Text style={styles.featureLabel}>Sounds</Text>
            </Column>
            <Column style={{ width: '2%' }}>&nbsp;</Column>
            <Column style={styles.featureTile}>
              <Text style={styles.featureEmoji}>✨</Text>
              <Text style={styles.featureLabel}>DNA</Text>
            </Column>
          </Row>
          <Text style={styles.hint}>
            Not expecting this? You can safely ignore this email.
          </Text>
        </Section>
        <Text style={styles.footerNav}>
          Help<span style={styles.footerNavSep}>·</span>Privacy<span style={styles.footerNavSep}>·</span>Status
        </Text>
        <Text style={styles.footer}>
          See you inside
          <span style={styles.footerBrand}>VYBEHUB.APP</span>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
