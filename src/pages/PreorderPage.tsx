import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Minus, Plus, Loader2 } from 'lucide-react';
import DailyFrame from '@/components/DailyFrame';
import DailyLegalFooter from '@/components/DailyLegalFooter';
import HomeControl from '@/components/HomeControl';
import FelixSignature from '@/components/FelixSignature';
import SupportBlock from '@/components/SupportBlock';
import headshotAsset from '@/assets/felix-headshot.jpg.asset.json';
import { Button } from '@/components/ui/button';
import { rulesType, GAME_COLORS, ChapterDivider } from '@/components/rulesLayout';
import { useIsMobile } from '@/hooks/use-mobile';
import { COLORS, RAW, SPACE, RADIUS, SHADOW, textStyle } from '@/lib/tokens';
import { cardArt } from '@/lib/assetUrls';
import { supabase } from '@/integrations/supabase/client';
import { trackEvent } from '@/lib/analytics';
import { clampQuantity, createPreorderCheckout, loadPreorderPrice, money, PREORDER_FALLBACK_PRICE, proofLabel } from '@/lib/preorder';

const FAQ = [
 ['When does it ship?', "Early December 2026. All pre-orders will arrive by the holidays. We'll email you as soon as your order is on its way."],
 ['When do I pay?', "At the time of ordering. Our preorder is helping support the production costs of this first run, and your new game will be in your hands within a matter of weeks."],
 ['Where do you ship?', 'Countries available for shipping will show during checkout. Shipping is free.'],
 ['Can I cancel my order?', "Yes, any time before it ships. Email hello@whoop-whoop.com and we'll refund you in full."],
 ['Is it the same game as the one online?', 'Yes. Solo and Together use the same rules. The table version adds a bigger 4 by 3 grid for harder games.'],
 ['Is it good for kids?', 'Yes! We recommend playing with ages 7 and up, though it is dependent on the maturity and memory of your kiddo. They are oftentimes better players than adults.'],
];
const CARDS = [['3-circle-red', 'Red Circle 3'], ['1-square-blue', 'Blue Square 1'], ['4-star-yellow', 'Orange Star 4']];
export default function PreorderPage() {
 const mobile = useIsMobile();
 const { body, read } = rulesType(mobile);
 const [quantity, setQuantity] = React.useState(1);
 const [price, setPrice] = React.useState(PREORDER_FALLBACK_PRICE);
 const [busy, setBusy] = React.useState(false);
 const [error, setError] = React.useState(false);
 const [count, setCount] = React.useState<number>(0);
 const pending = React.useRef(false);
 React.useEffect(() => {
  trackEvent('preorder_view');
  let active = true;
  void loadPreorderPrice().then(p => { if (active) setPrice(p); }).catch(() => console.warn('[preorder] live price unavailable; using fallback'));
  void supabase.rpc('public_daily_player_count').then(({ data }) => { if (active && data !== null) setCount(Number(data)); });
  return () => { active = false; };
 }, []);
 async function checkout() {
  if (pending.current) return;
  pending.current = true; setBusy(true); setError(false);
  trackEvent('preorder_click', { metadata: { quantity } });
  try { window.location.assign(await createPreorderCheckout(quantity)); }
  catch { console.error('[preorder] checkout cart request failed'); setError(true); pending.current = false; setBusy(false); }
 }
 const heading: React.CSSProperties = { ...textStyle('resultHero', mobile), color: COLORS.ink, margin: 0, lineHeight: 1.05, textAlign: 'center', letterSpacing: 0 };
 const link: React.CSSProperties = { ...body, color: COLORS.blueText, textDecoration: 'underline', textUnderlineOffset: 5, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
 const section: React.CSSProperties = { ...read, maxWidth: 720, textAlign: 'center', gap: mobile ? SPACE[12] : SPACE[16] };
 const divider = () => <ChapterDivider mobile={mobile} />;
 const panel: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE[12], padding: mobile ? SPACE[12] : SPACE[16], borderRadius: RADIUS.md, background: RAW.warmBlack, color: RAW.cream, width: '100%', maxWidth: 540, margin: '0 auto', boxSizing: 'border-box' };
 const purchaseGroup: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: SPACE[6], width: '100%', maxWidth: 540, margin: '0 auto' };
 const controls = <><div style={{ display: 'grid', gridTemplateColumns: mobile ? 'minmax(0, 1fr)' : '140px minmax(0, 1fr)', gap: SPACE[6], alignItems: 'center', width: '100%' }}><div role="group" aria-label="Quantity" style={{ display: 'grid', gridTemplateColumns: '44px 52px 44px', alignItems: 'center', justifySelf: 'center', border: '1.5px solid currentColor', borderRadius: RADIUS.sm }}>
   <Button variant="ghost" size="icon" aria-label="Decrease quantity" disabled={quantity === 1 || busy} onClick={() => setQuantity(clampQuantity(quantity - 1))} style={{ color: 'inherit', width: 44, height: 44 }}><Minus /></Button>
    <output aria-label="Quantity" aria-live="polite" style={{ ...textStyle('subhead', mobile), textAlign: 'center' }}>{quantity}</output>
   <Button variant="ghost" size="icon" aria-label="Increase quantity" disabled={quantity === 10 || busy} onClick={() => setQuantity(clampQuantity(quantity + 1))} style={{ color: 'inherit', width: 44, height: 44 }}><Plus /></Button>
  </div>
  <Button disabled={busy} onClick={() => void checkout()} style={{ ...textStyle('chip', mobile), background: COLORS.red, color: COLORS.onRed, width: '100%', minHeight: 56, whiteSpace: 'normal' }}>{busy ? <Loader2 className="animate-spin" aria-label="Loading" /> : null}Pre-order for {money(price * quantity)}</Button></div>
  {error && <p role="alert" style={{ ...body, color: 'inherit' }}>Something went wrong. Try again.</p>}</>;
 const buy = () => <div style={panel}><div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[3], alignItems: 'center' }}><p style={{ ...textStyle('resultHero', mobile), lineHeight: 1, margin: 0, color: 'inherit' }}>{money(price)}</p><p style={{ ...textStyle('label', mobile), color: 'inherit', margin: 0 }}>Free shipping.</p></div><p style={{ ...body, color: 'inherit', maxWidth: 360 }}>Claim yours today. Headed to you early December.</p>{controls}</div>;
 const label = proofLabel(count);
 return <><Helmet><title>Pre-order Whoop! Whoop! | The Card Game</title><meta name="description" content="The memory game where the rules keep changing, now as a real card game. Pre-order for $35 with free shipping. Ships December 2026." /><link rel="canonical" href="https://whoop-whoop.com/preorder" /></Helmet><HomeControl /><DailyFrame wide scroll align="top" topControl railGap={SPACE[20]}><article style={{ width: '100%', maxWidth: 804, paddingTop: SPACE[6], paddingBottom: SPACE[12], display: 'flex', flexDirection: 'column' }}>
  <header style={{ ...section, alignSelf: 'center' }}><p style={{ ...textStyle('label', mobile), color: COLORS.inkMuted, margin: 0 }}>Pre-order · Shipping Soon</p><h1 style={{ ...heading, fontSize: Math.round(rulesType(mobile).hero * 1.2) }}>Bring it to the table.</h1><p style={body}>The memory game where the rules keep changing. Now with real cards, with a real die, in a bag that fits in your pocket.</p>
  <div aria-label="Three card faces" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: mobile ? SPACE[4] : SPACE[8], width: '100%', maxWidth: 480, margin: `${SPACE[6]}px auto`, padding: SPACE[3], boxSizing: 'border-box' }}>{CARDS.map(([id, alt], i) => <img key={id} src={cardArt(id)} alt={alt} width={107} height={150} style={{ width: '100%', height: 'auto', aspectRatio: '107 / 150', display: 'block', borderRadius: RADIUS.sm, boxShadow: SHADOW.card, transform: `rotate(${(i - 1) * 8}deg) translateY(${i === 1 ? -8 : 0}px)` }} />)}</div><div style={purchaseGroup}>{buy()}<SupportBlock mobile={mobile} body={body} /></div></header>
  {divider()}<section style={section}><h2 style={heading}>Nine cards. One die.<br /><span style={{ fontStyle: 'italic' }}>Everyone shouting.</span></h2><div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: SPACE[10] }}>{[['Roll', 'Roll the die to reveal the rule for the round. Match the shape, color, or number.'], ['Flip', 'Reveal two cards per turn. Then flip them back over to hide them again.'], ['Whoop! Whoop!', 'Yell out Whoop! Whoop! when you think you have a matching pair.']].map(([title, copy], i) => <div key={title} style={{ display: 'flex', flexDirection: 'column', gap: SPACE[4] }}><span style={{ ...textStyle('resultHero', mobile), color: GAME_COLORS[i] }}>{i + 1}</span><h3 style={{ ...textStyle('title', mobile), color: COLORS.ink, margin: 0 }}>{title}</h3><p style={body}>{copy}</p></div>)}</div><Link to="/rules" style={link}>Read the full rules</Link></section>
  {divider()}<section style={section}><h2 style={heading}>What's in the bag</h2><ul style={{ ...body, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: SPACE[4] }}><li><strong>48 cards.</strong> Each one different.</li><li><strong>1 Match Die.</strong> Shape, number, or color.</li><li><strong>4 QR cards.</strong> They bring you to the game rules.</li><li><strong>1 canvas drawstring bag.</strong> To keep your new favorite game safe.</li></ul><p style={{ ...textStyle('caption', mobile), color: COLORS.inkMuted, margin: 0 }}>2 to 6 players · Ages 7+ (our recommendation, but your house, your rules)</p></section>
  {label && <>{divider()}<section style={section}><p style={{ ...heading, fontSize: mobile ? 72 : 104, color: COLORS.blueText }}>{label}</p><p style={body}>people have already played Whoop! Whoop! online.</p><Link style={link} to="/daily">Play today's Daily</Link></section></>}
  {divider()}<section style={{ ...section, background: RAW.cream, color: RAW.warmBlack, borderRadius: RADIUS.md, padding: mobile ? SPACE[8] : SPACE[12], boxSizing: 'border-box' }}><img src={headshotAsset.url} alt="Felix Oliha, designer of Whoop! Whoop!" width={116} height={116} style={{ width: mobile ? 92 : 116, height: mobile ? 92 : 116, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto', border: `2px solid ${RAW.warmBlack}` }} /><p style={{ ...textStyle('title', mobile), fontStyle: 'italic', color: 'inherit', margin: 0 }}>Hi, I'm Felix and I made Whoop! Whoop!{'\n'}for the dinner table.</p><p style={{ ...body, color: 'inherit' }}>The digital game came first because I couldn't wait to get Whoop! Whoop! into your hands. But the idea was always real cards, a real die, and a wild table full of people shouting over each other. This is it! Thank you for your support.</p><FelixSignature style={{ height: mobile ? 76 : 104, color: RAW.warmBlack, alignSelf: 'center' }} /><p style={{ ...textStyle('caption', mobile), color: 'inherit', margin: 0 }}>Designer &amp; game builder, Oleeha &amp; Co</p></section>
  {divider()}<section style={section}><h2 style={heading}>Questions</h2><div style={{ textAlign: 'left' }}>{FAQ.map(([question, answer]) => <details key={question} style={{ borderBottom: `1px solid ${COLORS.inkMuted}`, padding: `${SPACE[5]}px 0` }}><summary style={{ ...textStyle('title', mobile), color: COLORS.ink, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: SPACE[4], alignItems: 'center' }}>{question}<span className="preorder-plus" aria-hidden="true"><Plus size={20} /></span><span className="preorder-minus" aria-hidden="true"><Minus size={20} /></span></summary><p style={{ ...body, paddingTop: SPACE[4] }}>{answer}</p></details>)}</div></section>
  {divider()}<section style={{ ...section, gap: SPACE[6] }}><div style={panel}><h2 style={{ ...heading, fontSize: mobile ? 40 : 56, fontStyle: 'italic', color: 'inherit' }}>Claim your game</h2>{controls}<p style={{ ...textStyle('caption', mobile), color: 'inherit', margin: 0 }}>Questions? <a href="mailto:hello@whoop-whoop.com" style={{ color: 'inherit', textDecoration: 'underline' }}>hello@whoop-whoop.com</a></p></div><SupportBlock mobile={mobile} body={body} /></section><div style={{ marginTop: mobile ? SPACE[16] : SPACE[20] }}><DailyLegalFooter /></div>
 </article></DailyFrame><style>{`#root .preorder-minus{display:none}#root details[open] .preorder-minus{display:block}#root details[open] .preorder-plus{display:none}`}</style></>;
}
