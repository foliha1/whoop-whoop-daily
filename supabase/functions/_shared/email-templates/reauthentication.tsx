/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { CodeEmail } from './code-email.tsx'

export const ReauthenticationEmail = ({ token }: { token?: string }) => (
  <CodeEmail token={token} purpose="confirm it's you" />
)
export default ReauthenticationEmail
