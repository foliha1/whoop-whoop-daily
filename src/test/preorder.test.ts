import { describe, it, expect, vi, afterEach } from 'vitest';
import { clampQuantity, proofLabel, createPreorderCheckout, PREORDER_VARIANT, PREORDER_FALLBACK_PRICE, loadPreorderPrice } from '@/lib/preorder';
afterEach(() => vi.unstubAllGlobals());
describe('pre-order rules', () => {
 it('limits quantities to 1 through 10', () => { expect(clampQuantity(0)).toBe(1); expect(clampQuantity(11)).toBe(10); expect(clampQuantity(1)).toBe(1); });
 it('hides proof below 100 and rounds to the nearest hundred', () => { expect(proofLabel(99)).toBe(null); expect(proofLabel(2499)).toBe('2,500+'); expect(proofLabel(100)).toBe('100+'); expect(proofLabel(987)).toBe('1,000+'); });
 it('shows the $35 pre-order price when Shopify cannot be reached', () => { expect(PREORDER_FALLBACK_PRICE).toBe(35); expect(money(PREORDER_FALLBACK_PRICE)).toBe('$35'); });
 it('creates the specified real variant with selected quantity', async () => {
 const fetcher = vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{cartCreate:{cart:{checkoutUrl:'https://example.myshopify.com/checkout/test'},userErrors:[]}}})}); vi.stubGlobal('fetch',fetcher);
 expect(await createPreorderCheckout(3)).toContain('channel=online_store');
 expect(JSON.parse(fetcher.mock.calls[0][1].body).variables.input.lines).toEqual([{merchandiseId:PREORDER_VARIANT,quantity:3}]);
 });
 it('reads price from the exact variant in USD', async () => { vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{product:{variants:{nodes:[{id:PREORDER_VARIANT,price:{amount:'27.50',currencyCode:'USD'}}]}}}})})); expect(await loadPreorderPrice()).toBe(27.5); });
 it('rejects cart errors rather than navigating', async () => { vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({data:{cartCreate:{cart:null,userErrors:[{message:'Unavailable'}]}}})})); await expect(createPreorderCheckout(1)).rejects.toThrow(); });
});
