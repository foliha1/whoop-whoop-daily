/// <reference types="npm:@types/react@18.3.1" />
// One code-only layout for every auth email. There is no link and no button:
// the 6-digit code is the only way in, so sign-in always completes in the
// browser the player is already using (e.g. Instagram's in-app browser).
import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Html, Img, Preview, Text } from 'npm:@react-email/components@0.0.22'

/** Must match the auth OTP expiry. */
export const OTP_MINUTES = 60
export const SIX_DIGIT_CODE = /^[0-9]{6}$/

export const requireSixDigitCode = (token?: string): string => {
  const code = token?.trim() ?? ''
  if (!SIX_DIGIT_CODE.test(code)) throw new Error('Auth code must contain exactly six numeric digits')
  return code
}

export const codeSubject = (token?: string) => `Your WHOOP! WHOOP! code: ${requireSixDigitCode(token)}`

export const CodeEmail = ({ token, purpose }: { token?: string; purpose: string }) => {
  const codeValue = requireSixDigitCode(token)
  return <Html lang="en" dir="ltr">
    <Head>
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{`Your code: ${token ?? ''}`}</Preview>
    <Body className="dm-bg" style={main}>
      <Container className="dm-bg" style={container}>
        <Img
          src={APP_ICON_URL}
          width="48"
          height="48"
          alt="WHOOP! WHOOP! Daily app icon"
          style={avatar}
        />
        <Img
          className="logo-light"
          src={LIGHT_LOGO_URL}
          width="126"
          height="100"
          alt="WHOOP! WHOOP!"
          style={logo}
        />
        <Img
          className="logo-dark"
          src={DARK_LOGO_URL}
          width="126"
          height="100"
          alt=""
          aria-hidden="true"
          style={darkLogo}
        />
        <Text className="dm-ink" style={text}>Here's your code:</Text>
        <Text className="dm-ink" style={code}>{codeValue}</Text>
        <Text className="dm-ink" style={text}>
          Type it in to {purpose}. It works for {OTP_MINUTES} minutes.
        </Text>
        <Text className="dm-muted" style={footer}>
          Didn't ask for this? Ignore this email. Nothing happens without the code.
        </Text>
      </Container>
    </Body>
  </Html>
}

const CREAM = '#F8F2E9'
const INK = '#231F20'
const FONT = "'Friend', 'Helvetica Neue', Helvetica, Arial, sans-serif"
const APP_ICON_URL = 'https://www.whoop-whoop.com/icons/daily/icon-192.png'
const LIGHT_LOGO_URL = 'https://www.whoop-whoop.com/WhoopWhoop_Stacked_Logo.svg'
const DARK_LOGO_URL = 'https://www.whoop-whoop.com/WhoopWhoop_Dark_Logo.svg'

// Cream throughout; dark mode swaps to warm black.
const main = { backgroundColor: CREAM, fontFamily: FONT, margin: 0, padding: '24px 0' }
const container = {
  backgroundColor: CREAM,
  borderRadius: '12px',
  maxWidth: '440px',
  margin: '0 auto',
  padding: '32px 24px',
}
const avatar = { borderRadius: '8px', display: 'block', margin: '0 0 16px' }
const logo = { display: 'block', height: '100px', margin: '0 0 24px', width: '126px' }
const darkLogo = { ...logo, display: 'none' }
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
    .logo-light { display: none !important; }
    .logo-dark { display: block !important; }
  }
  [data-ogsc] .dm-ink { color: #F8F2E9 !important; }
  [data-ogsc] .dm-muted { color: #bdb4ab !important; }
  [data-ogsc] .logo-light { display: none !important; }
  [data-ogsc] .logo-dark { display: block !important; }
  [data-ogsb] .dm-bg { background-color: #231F20 !important; }
`
