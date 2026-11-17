import { describe, it, expect, vi, afterEach } from 'vitest';
import { clampQuantity, gamesLabel, money, proofLabel, createPreorderCheckout, PREORDER_VARIANT, PREORDER_FALLBACK_PRICE, loadPreorderPrice, openCheckoutWindow } from '@/lib/preorder';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('pre-order rules', () => {
 it('limits quantities to 1 through 10', () => { expect(clampQuantity(0)).toBe(1); expect(clampQuantity(11)).toBe(10); expect(clampQuantity(1)).toBe(1); });
 it('hides proof below 100 and rounds to the nearest hundred', () => { expect(proofLabel(99)).toBe(null); expect(proofLabel(2499)).toBe('2,500+'); expect(proofLabel(100)).toBe('100+'); expect(proofLabel(987)).toBe('1,000+'); });
 it('rounds games played down so the plus is never an overstatement', () => { expect(gamesLabel(99)).toBe(null); expect(gamesLabel(100)).toBe('100+'); expect(gamesLabel(2683)).toBe('2,600+'); });
 it('shows the $35 pre-order price when Shopify cannot be reached', () => { expect(PREORDER_FALLBACK_PRICE).toBe(35); expect(money(PREORDER_FALLBACK_PRICE)).toBe('$35'); });
 it('creates the specified real variant with selected quantity', async () => {
 const fetcher = vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{cartCreate:{cart:{checkoutUrl:'https://example.myshopify.com/checkout/test'},userErrors:[]}}})}); vi.stubGlobal('fetch',fetcher);
 expect(await createPreorderCheckout(3)).toContain('channel=online_store');
 expect(await createPreorderCheckout(3)).toContain('discount=FREESHIPPING');
 expect(JSON.parse(fetcher.mock.calls[0][1].body).variables.input.lines).toEqual([{merchandiseId:PREORDER_VARIANT,quantity:3}]);
 });
 it('reads price from the exact variant in USD', async () => { vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{product:{variants:{nodes:[{id:PREORDER_VARIANT,price:{amount:'27.50',currencyCode:'USD'}}]}}}})})); expect(await loadPreorderPrice()).toBe(27.5); });
 it('rejects cart errors rather than navigating', async () => { vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{cartCreate:{cart:null,userErrors:[{message:'Unavailable'}]}}})})); await expect(createPreorderCheckout(1)).rejects.toThrow(); });
});
import { supportLine } from '@/lib/preorder';
describe('support amounts', () => {
 it('maps preset tiers to one unit and custom amounts to $1 units, $1 to $500', () => {
  expect(supportLine(10)).toEqual({ merchandiseId: 'gid://shopify/ProductVariant/51643489091801', quantity: 1 });
  expect(supportLine(18)).toEqual({ merchandiseId: 'gid://shopify/ProductVariant/51643489026265', quantity: 18 });
  expect(supportLine(0)).toBeNull(); expect(supportLine(501)).toBeNull();
 });
});

describe('checkout opens in a new tab', () => {
 it('sends the cart URL to the tab opened at click time, detached from this page', () => {
  const tab = { opener: {}, location: { href: '' }, close: vi.fn() } as unknown as Window & { location: { href: string } };
  const opened = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window & typeof globalThis.Window);
  const checkout = openCheckoutWindow();
  expect(opened).toHaveBeenCalledWith('', '_blank');
  expect(checkout.newTab).toBe(true);
  checkout.navigate('https://example.myshopify.com/checkout/test');
  expect(tab.location.href).toBe('https://example.myshopify.com/checkout/test');
  expect(tab.opener).toBeNull();
 });
 it('closes the blank tab when the cart cannot be created', () => {
  const tab = { opener: {}, location: { href: '' }, close: vi.fn() } as unknown as Window & { location: { href: string } };
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window & typeof globalThis.Window);
  openCheckoutWindow().cancel();
  expect(tab.close).toHaveBeenCalled();
 });
 it('falls back to this tab when the browser blocks the new one', () => {
  vi.spyOn(window, 'open').mockReturnValue(null);
  expect(openCheckoutWindow().newTab).toBe(false);
 });
});
