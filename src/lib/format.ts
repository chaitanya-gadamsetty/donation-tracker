const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** 120000 -> "₹1,20,000" */
export function formatINR(amount: number): string {
  return inr.format(Math.round(amount))
}

export function newId(): string {
  // randomUUID needs a secure context (https/localhost); fall back for plain-http LAN testing.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && globalThis.isSecureContext !== false) {
    return crypto.randomUUID()
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}
