import { getDb } from '$lib/server/db';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const db = await getDb();
	const companyCode = url.searchParams.get('pt') || 'ART';
	const exportType = (url.searchParams.get('type') || 'excel').toLowerCase();

	// Ambil profil perusahaan
	const [companies]: any = await db.query('SELECT id, code, name FROM companies WHERE code = ?', [companyCode]);
	const company = companies[0] || { id: 1, code: 'ART', name: 'PT Anugerah Rezeki Teknindo' };

	// Ambil semua histori pembayaran untuk perusahaan ini
	const [payments]: any = await db.query(`
		SELECT 
			p.id, p.debt_id, p.company_id,
			DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS payment_date,
			DATE_FORMAT(p.payment_date, '%d/%m/%Y') AS payment_date_fmt,
			p.amount_paid, p.source_fund, p.notes,
			c.name AS contact_name,
			d.description AS debt_description,
			d.invoice_no
		FROM payments p
		JOIN debts d ON p.debt_id = d.id
		JOIN contacts c ON d.contact_id = c.id
		WHERE p.company_id = ?
		ORDER BY p.payment_date DESC, p.id DESC
	`, [company.id]);

	const now = new Date();
	const dateStr = now.toISOString().split('T')[0];
	const periodeStr = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }).toUpperCase();

	// ==========================================
	// 1. EXPORT EXCEL (SESUAI TEMPLATE ASLI DATA PEMBAYARAN)
	// ==========================================
	if (exportType === 'excel') {
		const wb = new ExcelJS.Workbook();
		const sheetName = `PEMBAYARAN ${company.code}`;
		const ws = wb.addWorksheet(sheetName, {
			pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true }
		});

		ws.columns = [
			{ width: 3 },  // A (margin)
			{ width: 6 },  // B: No
			{ width: 28 }, // C: Pihak / Penerima
			{ width: 45 }, // D: Keterangan
			{ width: 20 }, // E: Jumlah
			{ width: 16 }, // F: Sumber Dana
			{ width: 15 }  // G: Tanggal
		];

		// Judul Row 2
		ws.getCell('B2').value = `REKAP DAFTAR PEMBAYARAN ${company.name.toUpperCase()} - ${periodeStr}`;
		ws.getCell('B2').font = { bold: true, size: 12, name: 'Calibri' };

		// Headers Row 4
		const headers = [
			'NO',
			'PIHAK / PENERIMA',
			'KETERANGAN / KEPERLUAN PEMBAYARAN',
			'JUMLAH DIBAYAR',
			'SUMBER DANA',
			'TANGGAL BAYAR'
		];

		const headerRow = ws.getRow(4);
		headers.forEach((h, idx) => {
			const cell = headerRow.getCell(idx + 2); // B = 2
			cell.value = h;
			cell.font = { bold: true, size: 10, color: { argb: 'FF0F172A' }, name: 'Calibri' };
			cell.alignment = { vertical: 'middle', horizontal: idx === 0 || idx === 4 || idx === 5 ? 'center' : idx === 3 ? 'right' : 'left' };
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

		let currentRow = 5;
		let totalPaid = 0;

		payments.forEach((p: any, idx: number) => {
			const row = ws.getRow(currentRow);
			const amount = Number(p.amount_paid);
			totalPaid += amount;

			// No
			row.getCell('B').value = idx + 1;
			row.getCell('B').alignment = { horizontal: 'center' };

			// Pihak
			row.getCell('C').value = p.contact_name;
			row.getCell('C').font = { bold: true, size: 10, name: 'Calibri' };

			// Keterangan
			const fullDesc = p.notes ? `${p.debt_description} (${p.notes})` : p.debt_description;
			row.getCell('D').value = fullDesc;

			// Jumlah
			row.getCell('E').value = amount;
			row.getCell('E').numFmt = '#,##0';
			row.getCell('E').alignment = { horizontal: 'right' };
			row.getCell('E').font = { bold: true, size: 10, color: { argb: 'FF15803D' }, name: 'Calibri' };

			// Sumber Dana
			row.getCell('F').value = p.source_fund === 'bank' ? 'Transfer Bank' : 'Kas Tunai';
			row.getCell('F').alignment = { horizontal: 'center' };

			// Tanggal
			row.getCell('G').value = p.payment_date;
			row.getCell('G').alignment = { horizontal: 'center' };

			// Borders
			for (let c = 2; c <= 7; c++) {
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
		totalRow.getCell('B').value = 'TOTAL PEMBAYARAN (TOTAL NPP)';
		totalRow.getCell('B').font = { bold: true, size: 11, name: 'Calibri' };
		ws.mergeCells(`B${currentRow}:D${currentRow}`);

		totalRow.getCell('E').value = totalPaid;
		totalRow.getCell('E').numFmt = '#,##0';
		totalRow.getCell('E').font = { bold: true, size: 11, color: { argb: 'FF15803D' }, name: 'Calibri' };
		totalRow.getCell('E').alignment = { horizontal: 'right' };

		for (let c = 2; c <= 7; c++) {
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
				'Content-Disposition': `attachment; filename="REKAP_PEMBAYARAN_${company.code}_${dateStr}.xlsx"`
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
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(71, 85, 105);
	doc.text(`Periode: ${periodeStr} | Dicetak: ${dateStr}`, 14, 27);
	doc.setTextColor(0, 0, 0);

	let totalPaid = 0;
	const tableBody: any[] = payments.map((p: any, idx: number) => {
		const amount = Number(p.amount_paid);
		totalPaid += amount;
		const fullDesc = p.notes ? `${p.debt_description} (${p.notes})` : p.debt_description;
		return [
			(idx + 1).toString(),
			p.payment_date,
			p.contact_name,
			fullDesc,
			p.source_fund === 'bank' ? 'Transfer' : 'Tunai',
			'Rp. ' + amount.toLocaleString('id-ID')
		];
	});

	// Baris Total
	tableBody.push([
		{ content: 'TOTAL DANA KELUAR / PEMBAYARAN', colSpan: 5, styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } },
		{ content: 'Rp. ' + totalPaid.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', textColor: [21, 128, 61], fillColor: [240, 253, 244] } }
	]);

	autoTable(doc, {
		startY: 32,
		head: [[
			'NO',
			'TANGGAL',
			'PIHAK / PENERIMA',
			'KETERANGAN / KEPERLUAN',
			'SUMBER',
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
			cellPadding: 1.5,
			textColor: [15, 23, 42],
			lineColor: [203, 213, 225],
			lineWidth: 0.1
		},
		columnStyles: {
			0: { cellWidth: 10, halign: 'center' },
			1: { cellWidth: 22, halign: 'center' },
			2: { cellWidth: 42, fontStyle: 'bold' },
			3: { cellWidth: 'auto' },
			4: { cellWidth: 18, halign: 'center' },
			5: { cellWidth: 32, halign: 'right' }
		}
	});

	const pdfBytes = doc.output('arraybuffer');
	return new Response(pdfBytes, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="REKAP_PEMBAYARAN_${company.code}_${dateStr}.pdf"`
		}
	});
};
