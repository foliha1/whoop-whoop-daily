import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS, SPACE, RADIUS, panelStyle, textStyle } from '@/lib/tokens';
import { createSupportCheckout, money, openCheckoutWindow, SUPPORT_TIERS, supportLine } from '@/lib/preorder';

export default function SupportBlock({ mobile, body }: { mobile: boolean; body: React.CSSProperties }) {
 const [amount, setAmount] = React.useState<number>(10);
 const [custom, setCustom] = React.useState('');
 const [busy, setBusy] = React.useState(false);
 const [error, setError] = React.useState(false);
 const chosen = custom ? Number(custom) : amount;
 const valid = supportLine(chosen) !== null;
 async function give() {
  if (busy || !valid) return;
  setBusy(true); setError(false);
  const tab = openCheckoutWindow();
  try { tab.navigate(await createSupportCheckout(chosen)); setBusy(false); }
  catch { tab.cancel(); setError(true); setBusy(false); }
 }
 const pill = (active: boolean): React.CSSProperties => ({ ...textStyle('chip', mobile), minHeight: 44, borderRadius: RADIUS.sm, border: `1.5px solid ${COLORS.ink}`, background: active ? COLORS.ink : 'transparent', color: active ? COLORS.surface : COLORS.ink });
 return <div style={{ ...panelStyle('panel', mobile ? 12 : 16), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE[8], width: '100%', maxWidth: 540, margin: '0 auto', color: COLORS.ink, textAlign: 'center' }}>
  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[4], maxWidth: 400 }}>
  <p style={{ ...textStyle('title', mobile), margin: 0, color: 'inherit' }}>Not ready to buy? You can still support us!</p>
  <p style={{ ...body, margin: 0 }}>Chip in to keep Whoop! Whoop! free to play online.</p>
  </div>
  <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[5], width: '100%' }}>
  <div role="group" aria-label="Support amount" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: SPACE[3], width: '100%' }}>
   {SUPPORT_TIERS.map(t => <Button key={t.amount} variant="outline" type="button" aria-pressed={!custom && amount === t.amount} onClick={() => { setAmount(t.amount); setCustom(''); }} style={{ ...pill(!custom && amount === t.amount), padding: SPACE[2], minWidth: 0 }}>{money(t.amount)}</Button>)}
   <input className="ww-support-input" aria-label="Other amount in dollars" inputMode="numeric" placeholder="Other" value={custom} onChange={e => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))} style={{ ...pill(!!custom), background: 'transparent', color: COLORS.ink, textAlign: 'center', width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
  </div>
  <Button variant="outline" disabled={busy || !valid} onClick={() => void give()} style={{ ...textStyle('chip', mobile), width: '100%', minHeight: 52, background: COLORS.blue, color: COLORS.onBlue, border: `2px solid ${COLORS.ink}` }}>{busy ? <Loader2 className="animate-spin" aria-label="Loading" /> : null}{valid ? `Support with ${money(chosen)}` : 'Enter $1 to $500'}</Button>
  </div>
  {error && <p role="alert" style={{ ...body, margin: 0 }}>Something went wrong. Try again.</p>}
 </div>;
}
