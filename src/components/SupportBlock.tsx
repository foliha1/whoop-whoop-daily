import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { COLORS, RAW, SPACE, RADIUS, textStyle } from '@/lib/tokens';
import { createSupportCheckout, money, SUPPORT_TIERS, supportLine } from '@/lib/preorder';

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
  try { window.location.assign(await createSupportCheckout(chosen)); }
  catch { setError(true); setBusy(false); }
 }
 const pill = (active: boolean): React.CSSProperties => ({ ...textStyle('chip', mobile), minHeight: 44, borderRadius: RADIUS.sm, border: `1.5px solid ${COLORS.blue}`, background: active ? COLORS.blue : 'transparent', color: active ? COLORS.onBlue : COLORS.ink });
 return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE[4], width: '100%', maxWidth: 540, margin: '0 auto', boxSizing: 'border-box', padding: mobile ? SPACE[8] : SPACE[12], borderRadius: RADIUS.md, background: `color-mix(in srgb, ${RAW.blue} 14%, transparent)`, border: `2px solid ${RAW.blue}`, color: COLORS.ink }}>
  <p style={{ ...textStyle('title', mobile), margin: 0, color: 'inherit' }}>Not ready to buy? You can still support us!</p>
  <p style={{ ...body, margin: 0 }}>Chip in to keep WHOOP! WHOOP! free to play online.</p>
  <div role="group" aria-label="Support amount" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: SPACE[2], width: '100%' }}>
   {SUPPORT_TIERS.map(t => <button key={t.amount} type="button" aria-pressed={!custom && amount === t.amount} onClick={() => { setAmount(t.amount); setCustom(''); }} style={pill(!custom && amount === t.amount)}>{money(t.amount)}</button>)}
   <input aria-label="Other amount in dollars" inputMode="numeric" placeholder="Other" value={custom} onChange={e => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))} style={{ ...pill(!!custom), background: 'transparent', color: COLORS.ink, textAlign: 'center', width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
  </div>
  <Button variant="outline" disabled={busy || !valid} onClick={() => void give()} style={{ ...textStyle('chip', mobile), width: '100%', minHeight: 52, borderColor: COLORS.blue, color: COLORS.onBlue, background: COLORS.blue }}>{busy ? <Loader2 className="animate-spin" aria-label="Loading" /> : null}{valid ? `Support with ${money(chosen)}` : 'Enter $1 to $500'}</Button>
  {error && <p role="alert" style={{ ...body, margin: 0 }}>Something went wrong. Try again.</p>}
 </div>;
}
