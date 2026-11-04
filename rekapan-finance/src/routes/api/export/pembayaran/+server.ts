import { getDb } from '$lib/server/db';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RequestHandler } from './$types';

function getLocalDateStr(d: Date = new Date()): string {
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatIndoDate(isoDate: string): string {
	const parts = isoDate.split('-');
	if (parts.length < 3) return isoDate;
	const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
	if (isNaN(d.getTime())) return isoDate;
	return d.toLocaleDateString('id-ID', {
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric'
	}).toUpperCase();
}

export const GET: RequestHandler = async ({ url }) => {
	const db = await getDb();
	const companyCode = url.searchParams.get('pt') || 'ART';
	const exportType = (url.searchParams.get('type') || 'excel').toLowerCase();

	// Parameter filter tanggal (mendukung download per hari maupun rentang/bulan)
	const filterDate = url.searchParams.get('date')?.trim() || '';
	const filterStart = url.searchParams.get('start')?.trim() || '';
	const filterEnd = url.searchParams.get('end')?.trim() || '';
	const filterMonth = url.searchParams.get('month')?.trim() || '';
	const filterYear = url.searchParams.get('year')?.trim() || '';

	// Ambil profil perusahaan
	const [companies]: any = await db.query('SELECT id, code, name FROM companies WHERE code = ?', [companyCode]);
	const company = companies[0] || { id: 1, code: 'ART', name: 'PT Anugerah Rezeki Teknindo' };

	// Pastikan sinkronisasi payment_date dengan approved_at
	const effectivePaymentDateExpr = `CASE WHEN d.approved_at IS NOT NULL AND p.payment_date < DATE(d.approved_at) THEN DATE(d.approved_at) ELSE p.payment_date END`;

	const whereClauses: string[] = ['p.company_id = ?'];
	const queryParams: any[] = [company.id];

	if (filterDate) {
		whereClauses.push(`DATE_FORMAT(${effectivePaymentDateExpr}, '%Y-%m-%d') = ?`);
		queryParams.push(filterDate);
	} else if (filterStart || filterEnd) {
		if (filterStart) {
			whereClauses.push(`DATE_FORMAT(${effectivePaymentDateExpr}, '%Y-%m-%d') >= ?`);
			queryParams.push(filterStart);
		}
		if (filterEnd) {
			whereClauses.push(`DATE_FORMAT(${effectivePaymentDateExpr}, '%Y-%m-%d') <= ?`);
			queryParams.push(filterEnd);
		}
	} else {
		if (filterYear && filterYear !== 'all') {
			whereClauses.push(`YEAR(${effectivePaymentDateExpr}) = ?`);
			queryParams.push(Number(filterYear));
		}
		if (filterMonth && filterMonth !== 'all') {
			whereClauses.push(`MONTH(${effectivePaymentDateExpr}) = ?`);
			queryParams.push(Number(filterMonth));
		}
	}

	// Ambil histori pembayaran beserta tanggal nota/bon (d.invoice_date)
	const [payments]: any = await db.query(`
		SELECT 
			p.id, p.debt_id, p.company_id,
			DATE_FORMAT(${effectivePaymentDateExpr}, '%Y-%m-%d') AS payment_date,
			DATE_FORMAT(${effectivePaymentDateExpr}, '%d/%m/%Y') AS payment_date_fmt,
			DATE_FORMAT(d.invoice_date, '%Y-%m-%d') AS invoice_date,
			DATE_FORMAT(d.invoice_date, '%d/%m/%Y') AS invoice_date_fmt,
			p.amount_paid, p.notes,
			c.name AS contact_name,
			d.description AS debt_description,
			d.invoice_no,
			d.approved_by
		FROM payments p
		JOIN debts d ON p.debt_id = d.id
		JOIN contacts c ON d.contact_id = c.id
		WHERE ${whereClauses.join(' AND ')}
		ORDER BY payment_date DESC, c.name ASC, d.invoice_date ASC, p.id DESC
	`, queryParams);

	const now = new Date();
	const todayStr = getLocalDateStr(now);
	const fileDateSuffix = filterDate || (filterStart && filterEnd ? `${filterStart}_sd_${filterEnd}` : todayStr);

	let periodeStr = '';
	if (filterDate) {
		periodeStr = `HARIAN: ${formatIndoDate(filterDate)} (${filterDate})`;
	} else if (filterStart || filterEnd) {
		periodeStr = `PERIODE: ${filterStart || 'AWAL'} S/D ${filterEnd || 'SEKARANG'}`;
	} else if (filterMonth && filterMonth !== 'all' && filterYear && filterYear !== 'all') {
		const mDate = new Date(Number(filterYear), Number(filterMonth) - 1, 1);
		periodeStr = mDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase();
	} else if (filterYear && filterYear !== 'all') {
		periodeStr = `TAHUN ${filterYear}`;
	} else {
		periodeStr = 'SELURUH PERIODE';
	}

	// ==========================================
	// 1. EXPORT EXCEL DATA PEMBAYARAN
	// ==========================================
	if (exportType === 'excel') {
		const wb = new ExcelJS.Workbook();
		const sheetName = `PEMBAYARAN ${company.code}`;
		const ws = wb.addWorksheet(sheetName, {
			pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true }
		});

		ws.columns = [
			{ width: 3 },  // A (margin)
			{ width: 6 },  // B: No
			{ width: 28 }, // C: Pihak / Penerima (Supplier)
			{ width: 16 }, // D: No. Nota / Bon
			{ width: 15 }, // E: Tgl Nota / Bon
			{ width: 15 }, // F: Tgl Bayar / ACC
			{ width: 45 }, // G: Keterangan / Keperluan Pembayaran
			{ width: 20 }  // H: Jumlah Dibayar
		];

		// Judul Row 2
		ws.getCell('B2').value = `REKAP DAFTAR PEMBAYARAN ${company.name.toUpperCase()}`;
		ws.getCell('B2').font = { bold: true, size: 13, name: 'Calibri', color: { argb: 'FF0F172A' } };

		// Subjudul Periode Row 3
		ws.getCell('B3').value = `${periodeStr}  |  DICETAK: ${todayStr}`;
		ws.getCell('B3').font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF15803D' } };

		// Headers Row 5
		const headers = [
			'NO',
			'PIHAK / PENERIMA',
			'NO. NOTA / BON',
			'TGL NOTA / BON',
			'TGL BAYAR / ACC',
			'KETERANGAN / KEPERLUAN PEMBAYARAN',
			'JUMLAH DIBAYAR'
		];

		const headerRow = ws.getRow(5);
		headers.forEach((h, idx) => {
			const cell = headerRow.getCell(idx + 2); // B = 2
			cell.value = h;
			cell.font = { bold: true, size: 10, color: { argb: 'FF0F172A' }, name: 'Calibri' };
			cell.alignment = {
				vertical: 'middle',
				horizontal: idx === 0 || idx === 2 || idx === 3 || idx === 4 ? 'center' : idx === 6 ? 'right' : 'left'
			};
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFE2E8F0' }
			};
			cell.border = {
				top: { style: 'thin' },
				bottom: { style: 'medium' },
				left: { style: 'thin' },
				right: { style: 'thin' }
			};
		});
		headerRow.height = 25;

		let currentRow = 6;
		let totalPaid = 0;

		payments.forEach((p: any, idx: number) => {
			const row = ws.getRow(currentRow);
			const amount = Number(p.amount_paid);
			totalPaid += amount;

			// No
			row.getCell('B').value = idx + 1;
			row.getCell('B').alignment = { horizontal: 'center' };

			// Pihak / Supplier
			row.getCell('C').value = p.contact_name;
			row.getCell('C').font = { bold: true, size: 10, name: 'Calibri' };

			// No. Nota / Bon
			row.getCell('D').value = p.invoice_no || '-';
			row.getCell('D').alignment = { horizontal: 'center' };

			// Tgl Nota / Bon
			row.getCell('E').value = p.invoice_date || '-';
			row.getCell('E').alignment = { horizontal: 'center' };

			// Tgl Bayar / ACC
			row.getCell('F').value = p.payment_date;
			row.getCell('F').alignment = { horizontal: 'center' };
			row.getCell('F').font = { bold: true, size: 10, name: 'Calibri' };

			// Keterangan
			const fullDesc = p.notes && p.notes !== p.debt_description
				? `${p.debt_description} (${p.notes})`
				: p.debt_description;
			row.getCell('G').value = fullDesc;

			// Jumlah Dibayar
			row.getCell('H').value = amount;
			row.getCell('H').numFmt = '#,##0';
			row.getCell('H').alignment = { horizontal: 'right' };
			row.getCell('H').font = { bold: true, size: 10, color: { argb: 'FF15803D' }, name: 'Calibri' };

			// Borders
			for (let c = 2; c <= 8; c++) {
				const cell = row.getCell(c);
				cell.border = {
					top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
					bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
					left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
					right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
				};
			}

			currentRow++;
		});

		// Row Total Pembayaran di bawah
		const totalRow = ws.getRow(currentRow);
		totalRow.getCell('B').value = 'TOTAL PEMBAYARAN';
		totalRow.getCell('B').font = { bold: true, size: 11, name: 'Calibri' };
		ws.mergeCells(`B${currentRow}:G${currentRow}`);

		totalRow.getCell('H').value = totalPaid;
		totalRow.getCell('H').numFmt = '#,##0';
		totalRow.getCell('H').font = { bold: true, size: 11, color: { argb: 'FF15803D' }, name: 'Calibri' };
		totalRow.getCell('H').alignment = { horizontal: 'right' };

		for (let c = 2; c <= 8; c++) {
			const cell = totalRow.getCell(c);
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFE2E8F0' }
			};
			cell.border = {
				top: { style: 'thin', color: { argb: 'FF0F172A' } },
				bottom: { style: 'double', color: { argb: 'FF0F172A' } },
				left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
				right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
			};
		}

		const buffer = await wb.xlsx.writeBuffer();
		return new Response(buffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="REKAP_PEMBAYARAN_${company.code}_${fileDateSuffix}.xlsx"`
			}
		});
	}

	// ==========================================
	// 2. EXPORT PDF DATA PEMBAYARAN
	// ==========================================
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

	// Header Laporan
	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('REKAP DAFTAR PEMBAYARAN', 14, 15);

	doc.setFontSize(10.5);
	doc.text(company.name.toUpperCase(), 14, 21);

	doc.setFontSize(9);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(21, 128, 61);
	doc.text(`${periodeStr} | Dicetak: ${todayStr}`, 14, 27);
	doc.setTextColor(0, 0, 0);

	let totalPaid = 0;
	const tableBody: any[] = payments.map((p: any, idx: number) => {
		const amount = Number(p.amount_paid);
		totalPaid += amount;
		const fullDesc = p.notes && p.notes !== p.debt_description
			? `${p.debt_description} (${p.notes})`
			: p.debt_description;
		const notaInfo = p.invoice_no && p.invoice_no !== 'Tanpa Bon'
			? `${p.invoice_date || '-'}\n(${p.invoice_no})`
			: (p.invoice_date || '-');

		return [
			(idx + 1).toString(),
			p.contact_name,
			notaInfo,
			p.payment_date,
			fullDesc,
			'Rp. ' + Math.round(amount).toLocaleString('id-ID')
		];
	});

	// Baris Total
	tableBody.push([
		{ content: 'TOTAL DANA KELUAR / PEMBAYARAN', colSpan: 5, styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } },
		{ content: 'Rp. ' + Math.round(totalPaid).toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', textColor: [21, 128, 61], fillColor: [240, 253, 244] } }
	]);

	autoTable(doc, {
		startY: 32,
		head: [[
			'NO',
			'PIHAK / PENERIMA',
			'TGL NOTA / BON',
			'TGL BAYAR',
			'KETERANGAN / KEPERLUAN',
			'JUMLAH DIBAYAR'
		]],
		body: tableBody,
		theme: 'grid',
		headStyles: {
			fillColor: [15, 23, 42],
			textColor: [255, 255, 255],
			fontStyle: 'bold',
			fontSize: 8,
			halign: 'center'
		},
		styles: {
			fontSize: 7.5,
			cellPadding: 1.8,
			textColor: [15, 23, 42],
			lineColor: [203, 213, 225],
			lineWidth: 0.1
		},
		columnStyles: {
			0: { cellWidth: 9, halign: 'center' },
			1: { cellWidth: 38, fontStyle: 'bold' },
			2: { cellWidth: 24, halign: 'center' },
			3: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
			4: { cellWidth: 'auto' },
			5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' }
		}
	});

	const pdfBytes = doc.output('arraybuffer');
	return new Response(pdfBytes, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="REKAP_PEMBAYARAN_${company.code}_${fileDateSuffix}.pdf"`
		}
	});
};
