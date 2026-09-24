/// <reference types="npm:@types/react@18.3.1" />
// One code-only layout for every auth email. There is no link and no button:
// the 6-digit code is the only way in, so sign-in always completes in the
// browser the player is already using (e.g. Instagram's in-app browser).
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Html, Preview, Text } from 'npm:@react-email/components@0.0.22'

/** Must match the auth OTP expiry. */
export const OTP_MINUTES = 60

export const codeSubject = (token?: string) =>
  token ? `Your WHOOP! WHOOP! code: ${token}` : 'Your WHOOP! WHOOP! code'

export const CodeEmail = ({ token, purpose }: { token?: string; purpose: string }) => (
  <Html lang="en" dir="ltr">
    <Head>
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{`Your code: ${token ?? ''}`}</Preview>
    <Body className="dm-bg" style={main}>
      <Container className="dm-bg" style={container}>
        <Text className="dm-accent" style={brand}>WHOOP! WHOOP!</Text>
        <Text className="dm-ink" style={text}>Here's your code:</Text>
        <Text className="dm-ink" style={code}>{token}</Text>
        <Text className="dm-ink" style={text}>
          Type it in to {purpose}. It works for {OTP_MINUTES} minutes.
        </Text>
        <Text className="dm-muted" style={footer}>
          Didn't ask for this? Ignore this email. Nothing happens without the code.
        </Text>
      </Container>
    </Body>
  </Html>
)

const CREAM = '#F8F2E9'
const INK = '#231F20'
const RED = '#d72229'
const FONT = "'Friend', 'Helvetica Neue', Helvetica, Arial, sans-serif"

// Cream throughout; dark mode swaps to warm black.
const main = { backgroundColor: CREAM, fontFamily: FONT, margin: 0, padding: '24px 0' }
const container = {
  backgroundColor: CREAM,
  borderRadius: '12px',
  maxWidth: '440px',
  margin: '0 auto',
  padding: '32px 24px',
}
const brand = { fontSize: '26px', fontStyle: 'italic' as const, color: RED, margin: '0 0 24px', letterSpacing: '0.5px' }
const text = { fontSize: '16px', lineHeight: '1.5', color: INK, margin: '0 0 12px' }
const code = {
  fontFamily: "'SF Mono', Menlo, Consolas, 'Courier New', monospace",
  fontSize: '40px',
  lineHeight: '1.2',
  letterSpacing: '10px',
  color: INK,
  margin: '8px 0 20px',
}
const footer = { fontSize: '14px', lineHeight: '1.5', color: '#6b6461', margin: '24px 0 0' }

// Text child: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-bg { background-color: #231F20 !important; }
    .dm-ink { color: #F8F2E9 !important; }
    .dm-muted { color: #bdb4ab !important; }
    .dm-accent { color: #ff5a5f !important; }
  }
  [data-ogsc] .dm-ink { color: #F8F2E9 !important; }
  [data-ogsc] .dm-muted { color: #bdb4ab !important; }
  [data-ogsc] .dm-accent { color: #ff5a5f !important; }
  [data-ogsb] .dm-bg { background-color: #231F20 !important; }
`
