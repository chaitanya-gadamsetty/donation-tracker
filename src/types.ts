export const CATEGORIES = ['Education', 'Food', 'Health', 'Others'] as const
export type Category = (typeof CATEGORIES)[number]

export const RELIABILITY = ['unrated', 'reliable', 'neutral', 'unreliable'] as const
export type Reliability = (typeof RELIABILITY)[number]

export const RELIABILITY_LABEL: Record<Reliability, string> = {
  unrated: 'Not rated',
  reliable: 'Reliable',
  neutral: 'Neutral',
  unreliable: 'Non-reliable',
}

export const PAYMENT_MODES = ['UPI', 'Bank', 'Card', 'Cash', 'Cheque'] as const
export type PaymentMode = (typeof PAYMENT_MODES)[number]

export const RECEIPT_STATUSES = ['pending', 'received', 'na'] as const
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number]

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  pending: 'Receipt pending',
  received: 'Receipt received',
  na: 'No receipt',
}

export const CADENCES = ['monthly', 'quarterly', 'yearly'] as const
export type Cadence = (typeof CADENCES)[number]

export type Eligibility80G = '' | '50' | '100' | 'none'

/** Every synced record carries these so devices can merge record-by-record. */
export interface SyncFields {
  id: string
  updatedAt: number
  /** 1 = deleted (kept as tombstone so the delete syncs). Number so Dexie can index it. */
  deleted: 0 | 1
}

export interface Foundation extends SyncFields {
  name: string
  category: Category
  reliability: Reliability
  reliabilityReason: string
  comments: string
  pan: string
  reg80G: string
  eligibility80G: Eligibility80G
}

export interface Donation extends SyncFields {
  foundationId: string
  amount: number
  /** Local date, YYYY-MM-DD */
  date: string
  mode: PaymentMode
  note: string
  receiptStatus: ReceiptStatus
  receiptId: string
  pledgeId: string
  source: 'voice' | 'manual'
}

export interface Pledge extends SyncFields {
  foundationId: string
  amount: number
  cadence: Cadence
  /** YYYY-MM-DD */
  nextDueDate: string
  active: boolean
  note: string
}

export interface Receipt extends SyncFields {
  donationId: string
  fileName: string
  mimeType: string
  blob: Blob
  /** Google Drive file holding this receipt, once uploaded by any device. */
  driveFileId?: string
}

export interface Settings {
  id: 'settings'
  defaultBudget: number
  /** Per-year override, e.g. { "2027": 150000 } */
  budgets: Record<string, number>
  lastBackupAt: number
  updatedAt: number
}
