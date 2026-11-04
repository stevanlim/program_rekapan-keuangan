export interface Company {
	id: number;
	code: string;
	name: string;
}

export interface Contact {
	id: number;
	name: string;
	type: 'supplier' | 'non_vendor';
}

export interface Debt {
	id: number;
	company_id: number;
	company_code?: string;
	company_name?: string;
	contact_id: number;
	contact_name: string;
	contact_type: 'supplier' | 'non_vendor';
	invoice_no: string | null;
	invoice_date: string;
	due_date: string | null;
	effective_due_date: string;
	amount: number;
	paid_amount: number;
	remaining_amount: number;
	description: string;
	status: 'unpaid' | 'partially_paid' | 'pending_approval' | 'paid';
	days_overdue: number;
	days_until_due: number;
	aging_bucket: '0-30' | '31-60' | '61-90' | '91-120' | '>120';
	urgency: 'safe' | 'h5' | 'overdue';
	pending_amount?: number | null;
	pending_payment_date?: string | null;
	pending_source_fund?: string | null;
	pending_notes?: string | null;
	pending_by?: string | null;
	approved_by?: string | null;
	approved_at?: string | null;
	payment_date?: string | null;
	rejected_notes?: string | null;
}

export interface Payment {
	id: number;
	debt_id: number;
	company_id: number;
	company_code?: string;
	payment_date: string;
	invoice_date?: string;
	amount_paid: number;
	source_fund: string;
	notes: string | null;
	contact_name?: string;
	debt_description?: string;
	invoice_no?: string | null;
}

export interface DailyBalance {
	id: number;
	company_id: number;
	company_code?: string;
	company_name?: string;
	balance_date: string;
	balance_amount: number;
	notes: string | null;
	created_at_fmt?: string;
}

export interface AgingBuckets {
	b0_30: number;
	b31_60: number;
	b61_90: number;
	b91_120: number;
	b_over120: number;
	total: number;
}
