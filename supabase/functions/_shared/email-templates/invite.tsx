/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { styles } from './_styles.ts'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join VYBE</Preview>
    <Body style={styles.main}>
      <Container style={styles.container}>
        <Section style={styles.header}>
          <Heading style={styles.logoText}>VYBE</Heading>
          <Text style={styles.logoTagline}>Your social. Your vibe.</Text>
        </Section>
        <Section style={styles.body}>
          <Heading style={styles.h1}>You're invited 💫</Heading>
          <Text style={styles.text}>
            Someone wants you on{' '}
            <Link href={siteUrl} style={styles.link}>VYBE</Link>. Accept your invite and start sharing your vibe.
          </Text>
          <Button style={styles.button} href={confirmationUrl}>
            Accept Invitation
          </Button>
          <Text style={{ ...styles.hint, marginTop: '28px' }}>
            Not expecting this? You can safely ignore this email.
          </Text>
        </Section>
        <Text style={styles.footer}>
          See you inside
          <span style={styles.footerBrand}>VYBEHUB.APP</span>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
