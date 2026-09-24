/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { CodeEmail } from './code-email.tsx'

export const SignupEmail = ({ token }: { token?: string }) => (
  <CodeEmail token={token} purpose="save your score" />
)
export default SignupEmail
