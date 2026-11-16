export const PREORDER_VARIANT = 'gid://shopify/ProductVariant/51641877758169';
export const PREORDER_FALLBACK_PRICE = 35;
export const PREORDER_DISCOUNT_CODE = 'FREESHIPPING';
const ENDPOINT = 'https://nx0wa1-zs.myshopify.com/api/2026-10/graphql.json';
const TOKEN = '67cb170cac5b04b9fa53055ceadf1f32';
export function clampQuantity(quantity: number) { return Math.min(10, Math.max(1, Math.trunc(quantity) || 1)); }
export function proofLabel(count: number): string | null { return Number.isFinite(count) && count >= 100 ? `${(Math.round(count / 100) * 100).toLocaleString('en-US')}+` : null; }
export function money(price: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: price % 1 ? 2 : 0 }).format(price); }
async function request(query: string, variables: Record<string, unknown> = {}) {
 const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': TOKEN }, body: JSON.stringify({ query, variables }) });
 if (!response.ok) throw new Error(`Shopify request failed (${response.status})`);
 const result = await response.json();
 if (result.errors?.length) throw new Error('Shopify request rejected');
 return result.data;
}
export async function loadPreorderPrice(): Promise<number> {
 const data = await request(`query { product(handle: "whoop-whoop-card-game") { variants(first: 10) { nodes { id price { amount currencyCode } } } } }`);
 const variant = data?.product?.variants?.nodes?.find((v: { id: string }) => v.id === PREORDER_VARIANT);
 const price = Number(variant?.price?.amount);
 if (!variant || variant.price.currencyCode !== 'USD' || !Number.isFinite(price) || price <= 0) throw new Error('Product price unavailable');
 return price;
}
export async function createPreorderCheckout(quantity: number): Promise<string> {
 const data = await request(`mutation($input: CartInput!) { cartCreate(input: $input) { cart { checkoutUrl } userErrors { message } } }`, { input: { lines: [{ merchandiseId: PREORDER_VARIANT, quantity: clampQuantity(quantity) }] } });
 const result = data?.cartCreate;
 if (result?.userErrors?.length || !result?.cart?.checkoutUrl) throw new Error('Shopify cart creation failed');
 const url = new URL(result.cart.checkoutUrl);
 if (url.protocol !== 'https:') throw new Error('Invalid checkout URL');
 url.searchParams.set('channel', 'online_store');
 url.searchParams.set('discount', PREORDER_DISCOUNT_CODE);
 return url.toString();
}
export const SUPPORT_TIERS = [
 { amount: 5, variant: 'gid://shopify/ProductVariant/51643489059033' },
 { amount: 10, variant: 'gid://shopify/ProductVariant/51643489091801' },
 { amount: 25, variant: 'gid://shopify/ProductVariant/51643489124569' },
] as const;
export const SUPPORT_UNIT_VARIANT = 'gid://shopify/ProductVariant/51643489026265';
export function supportLine(amount: number): { merchandiseId: string; quantity: number } | null {
 if (!Number.isInteger(amount) || amount < 1 || amount > 500) return null;
 const tier = SUPPORT_TIERS.find(t => t.amount === amount);
 return tier ? { merchandiseId: tier.variant, quantity: 1 } : { merchandiseId: SUPPORT_UNIT_VARIANT, quantity: amount };
}
export async function createSupportCheckout(amount: number): Promise<string> {
 const line = supportLine(amount);
 if (!line) throw new Error('Invalid support amount');
 const data = await request(`mutation($input: CartInput!) { cartCreate(input: $input) { cart { checkoutUrl } userErrors { message } } }`, { input: { lines: [line] } });
 const result = data?.cartCreate;
 if (result?.userErrors?.length || !result?.cart?.checkoutUrl) throw new Error('Shopify cart creation failed');
 const url = new URL(result.cart.checkoutUrl);
 if (url.protocol !== 'https:') throw new Error('Invalid checkout URL');
 url.searchParams.set('channel', 'online_store');
 return url.toString();
}
