// Pul: API-də decimal (125.50), DB-də minor units — qəpik (12550). Çevirmə yalnız burada olur.
export const toMinor = (amount: number): number => Math.round(amount * 100);
export const fromMinor = (minor: number): number => minor / 100;
export const formatMoney = (minor: number, currency: string): string => `${(minor / 100).toFixed(2)} ${currency}`;
