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

export const GET: RequestHandler = async ({ url }) => {
	const db = await getDb();
	const companyCode = url.searchParams.get('pt') || 'ART';
	const exportType = (url.searchParams.get('type') || 'excel').toLowerCase();

	// Ambil profil perusahaan
	const [companies]: any = await db.query('SELECT id, code, name FROM companies WHERE code = ?', [companyCode]);
	const company = companies[0] || { id: 1, code: 'ART', name: 'PT Anugerah Rezeki Teknindo' };

	// Ambil saldo terakhir perusahaan
	const [balanceRows]: any = await db.query(`
		SELECT balance_amount, DATE_FORMAT(balance_date, '%d/%m/%Y') AS balance_date_fmt
		FROM daily_balances
		WHERE company_id = ?
		ORDER BY balance_date DESC, id DESC LIMIT 1
	`, [company.id]);
	const latestBalance = balanceRows[0];

	// Ambil semua tagihan yang sedang menunggu ACC (pending_approval) untuk perusahaan ini
	const [pendingDebts]: any = await db.query(`
		SELECT 
			d.id, d.contact_id, c.name AS contact_name, COALESCE(d.contact_type, c.type) AS contact_type,
			d.invoice_no,
			DATE_FORMAT(d.invoice_date, '%Y-%m-%d') AS invoice_date,
			DATE_FORMAT(COALESCE(d.due_date, DATE_ADD(d.invoice_date, INTERVAL 30 DAY)), '%Y-%m-%d') AS due_date,
			d.amount, d.paid_amount, (d.amount - d.paid_amount) AS remaining_amount,
			COALESCE(d.pending_amount, (d.amount - d.paid_amount)) AS pending_amount,
			DATE_FORMAT(COALESCE(d.pending_payment_date, CURRENT_DATE()), '%Y-%m-%d') AS pending_payment_date,
			d.pending_notes,
			COALESCE(d.pending_by, 'Admin Keuangan') AS pending_by,
			d.description
		FROM debts d
		JOIN contacts c ON d.contact_id = c.id
		WHERE d.company_id = ? AND d.status = 'pending_approval'
		ORDER BY c.name ASC, d.invoice_date ASC
	`, [company.id]);

	const now = new Date();
	const dateStr = getLocalDateStr(now);
	const periodeStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase();

	// ==========================================
	// 1. EXPORT EXCEL DAFTAR MENUNGGU ACC
	// ==========================================
	if (exportType === 'excel') {
		const wb = new ExcelJS.Workbook();
		const sheetName = `MENUNGGU ACC ${company.code}`;
		const ws = wb.addWorksheet(sheetName, {
			pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true }
		});

		ws.columns = [
			{ width: 3 },  // A (margin)
			{ width: 6 },  // B: No
			{ width: 28 }, // C: Supplier / Pihak
			{ width: 15 }, // D: Kategori
			{ width: 16 }, // E: No. Nota / Bon
			{ width: 15 }, // F: Tgl Nota / Bon
			{ width: 42 }, // G: Keterangan / Keperluan
			{ width: 18 }, // H: Total Bon
			{ width: 20 }, // I: Nominal Diajukan (ACC)
			{ width: 16 }, // J: Tgl Pengajuan
			{ width: 28 }  // K: Catatan Pengajuan
		];

		// Judul Laporan
		ws.getCell('B2').value = `DAFTAR PENGAJUAN PEMBAYARAN (MENUNGGU ACC ATASAN)`;
		ws.getCell('B2').font = { bold: true, size: 13, name: 'Calibri', color: { argb: 'FF0F172A' } };

		ws.getCell('B3').value = `${company.name.toUpperCase()} (${company.code}) — TANGGAL CETAK: ${periodeStr}`;
		ws.getCell('B3').font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF475569' } };

		if (latestBalance?.balance_amount !== undefined) {
			const saldoNominal = Math.round(Number(latestBalance.balance_amount)).toLocaleString('id-ID');
			ws.getCell('B4').value = `POSISI SALDO TERAKHIR (${latestBalance.balance_date_fmt || dateStr}) : RP ${saldoNominal}`;
			ws.getCell('B4').font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF166534' } };
		}

		// Header Tabel di Row 6
		const headers = [
			'NO',
			'SUPPLIER / PIHAK',
			'KATEGORI',
			'NO. NOTA / BON',
			'TGL NOTA / BON',
			'KETERANGAN / KEPERLUAN',
			'TOTAL BON',
			'NOMINAL DIAJUKAN',
			'TGL PENGAJUAN',
			'CATATAN PENGAJUAN'
		];

		const headerRow = ws.getRow(6);
		headers.forEach((h, idx) => {
			const cell = headerRow.getCell(idx + 2); // B = 2
			cell.value = h;
			cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
			cell.alignment = {
				vertical: 'middle',
				horizontal: idx === 0 || idx === 2 || idx === 3 || idx === 4 || idx === 8 ? 'center' : idx === 6 || idx === 7 ? 'right' : 'left'
			};
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFB45309' } // Amber-700
			};
			cell.border = {
				top: { style: 'thin' },
				bottom: { style: 'medium' },
				left: { style: 'thin' },
				right: { style: 'thin' }
			};
		});
		headerRow.height = 26;

		let currentRow = 7;
		let totalAmount = 0;
		let totalPending = 0;

		pendingDebts.forEach((d: any, idx: number) => {
			const row = ws.getRow(currentRow);
			const amt = Number(d.amount || 0);
			const pendAmt = Number(d.pending_amount || d.remaining_amount || 0);
			totalAmount += amt;
			totalPending += pendAmt;

			row.getCell('B').value = idx + 1;
			row.getCell('B').alignment = { horizontal: 'center' };

			row.getCell('C').value = d.contact_name;
			row.getCell('C').font = { bold: true, size: 10, name: 'Calibri' };

			row.getCell('D').value = d.contact_type === 'non_vendor' ? 'Non-Vendor' : 'Supplier';
			row.getCell('D').alignment = { horizontal: 'center' };

			row.getCell('E').value = d.invoice_no || '-';
			row.getCell('E').alignment = { horizontal: 'center' };

			row.getCell('F').value = d.invoice_date;
			row.getCell('F').alignment = { horizontal: 'center' };

			row.getCell('G').value = d.description;

			row.getCell('H').value = amt;
			row.getCell('H').numFmt = '#,##0';
			row.getCell('H').alignment = { horizontal: 'right' };

			row.getCell('I').value = pendAmt;
			row.getCell('I').numFmt = '#,##0';
			row.getCell('I').alignment = { horizontal: 'right' };
			row.getCell('I').font = { bold: true, size: 10, color: { argb: 'FFB45309' }, name: 'Calibri' };

			row.getCell('J').value = d.pending_payment_date || d.invoice_date;
			row.getCell('J').alignment = { horizontal: 'center' };

			row.getCell('K').value = d.pending_notes ? `${d.pending_notes} (Oleh: ${d.pending_by})` : `Diajukan oleh: ${d.pending_by}`;

			for (let c = 2; c <= 11; c++) {
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

		// Baris Total
		const totalRow = ws.getRow(currentRow);
		totalRow.getCell('B').value = 'TOTAL PENGAJUAN MENUNGGU ACC';
		totalRow.getCell('B').font = { bold: true, size: 11, name: 'Calibri' };
		ws.mergeCells(`B${currentRow}:G${currentRow}`);

		totalRow.getCell('H').value = totalAmount;
		totalRow.getCell('H').numFmt = '#,##0';
		totalRow.getCell('H').font = { bold: true, size: 10, name: 'Calibri' };
		totalRow.getCell('H').alignment = { horizontal: 'right' };

		totalRow.getCell('I').value = totalPending;
		totalRow.getCell('I').numFmt = '#,##0';
		totalRow.getCell('I').font = { bold: true, size: 11, color: { argb: 'FFB45309' }, name: 'Calibri' };
		totalRow.getCell('I').alignment = { horizontal: 'right' };

		for (let c = 2; c <= 11; c++) {
			const cell = totalRow.getCell(c);
			cell.fill = {
				type: 'pattern',
				pattern: 'solid',
				fgColor: { argb: 'FFFEF3C7' }
			};
			cell.border = {
				top: { style: 'thin', color: { argb: 'FF92400E' } },
				bottom: { style: 'double', color: { argb: 'FF92400E' } },
				left: { style: 'thin', color: { argb: 'FFFDE68A' } },
				right: { style: 'thin', color: { argb: 'FFFDE68A' } }
			};
		}
		totalRow.height = 24;

		const buffer = await wb.xlsx.writeBuffer();
		return new Response(buffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="PENGAJUAN_ACC_${company.code}_${dateStr}.xlsx"`
			}
		});
	}

	// ==========================================
	// 2. EXPORT PDF DAFTAR MENUNGGU ACC
	// ==========================================
	const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

	doc.setFontSize(13);
	doc.setFont('helvetica', 'bold');
	doc.text('DAFTAR PENGAJUAN PEMBAYARAN (MENUNGGU ACC ATASAN)', 14, 15);

	doc.setFontSize(10.5);
	doc.text(`${company.name.toUpperCase()} (${company.code})`, 14, 21);

	doc.setFontSize(8.5);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(71, 85, 105);
	const saldoInfo = latestBalance?.balance_amount !== undefined
		? ` | Saldo Terakhir (${latestBalance.balance_date_fmt || dateStr}): Rp. ${Math.round(Number(latestBalance.balance_amount)).toLocaleString('id-ID')}`
		: '';
	doc.text(`Tanggal Cetak: ${periodeStr} | Jumlah Antrean: ${pendingDebts.length} Tagihan${saldoInfo}`, 14, 26.5);
	doc.setTextColor(0, 0, 0);

	let totalBon = 0;
	let totalPengajuan = 0;

	const tableBody: any[] = pendingDebts.map((d: any, idx: number) => {
		const amt = Number(d.amount || 0);
		const pendAmt = Number(d.pending_amount || d.remaining_amount || 0);
		totalBon += amt;
		totalPengajuan += pendAmt;

		const ket = d.pending_notes ? `${d.description}\n(Catatan: ${d.pending_notes})` : d.description;

		return [
			(idx + 1).toString(),
			d.contact_name,
			d.contact_type === 'non_vendor' ? 'Non-Vendor' : 'Supplier',
			d.invoice_no || '-',
			d.invoice_date,
			ket,
			'Rp. ' + Math.round(amt).toLocaleString('id-ID'),
			'Rp. ' + Math.round(pendAmt).toLocaleString('id-ID'),
			d.pending_payment_date || d.invoice_date
		];
	});

	tableBody.push([
		{ content: 'TOTAL PENGAJUAN MENUNGGU ACC ATASAN', colSpan: 6, styles: { fontStyle: 'bold', fillColor: [254, 243, 199], textColor: [146, 64, 14] } },
		{ content: 'Rp. ' + Math.round(totalBon).toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [254, 243, 199] } },
		{ content: 'Rp. ' + Math.round(totalPengajuan).toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', textColor: [180, 83, 9], fillColor: [254, 243, 199] } },
		{ content: '', styles: { fillColor: [254, 243, 199] } }
	]);

	autoTable(doc, {
		startY: 31,
		head: [[
			'NO',
			'SUPPLIER / PIHAK',
			'TIPE',
			'NO. NOTA / BON',
			'TGL NOTA / BON',
			'KETERANGAN / KEPERLUAN',
			'TOTAL BON',
			'NOMINAL DIAJUKAN',
			'TGL PENGAJUAN'
		]],
		body: tableBody,
		theme: 'grid',
		headStyles: {
			fillColor: [180, 83, 9],
			textColor: [255, 255, 255],
			fontStyle: 'bold',
			fontSize: 8,
			halign: 'center'
		},
		styles: {
			fontSize: 7.5,
			cellPadding: 2,
			textColor: [15, 23, 42],
			lineColor: [203, 213, 225],
			lineWidth: 0.1
		},
		columnStyles: {
			0: { cellWidth: 10, halign: 'center' },
			1: { cellWidth: 44, fontStyle: 'bold' },
			2: { cellWidth: 22, halign: 'center' },
			3: { cellWidth: 25, halign: 'center' },
			4: { cellWidth: 22, halign: 'center' },
			5: { cellWidth: 'auto' },
			6: { cellWidth: 30, halign: 'right' },
			7: { cellWidth: 34, halign: 'right', fontStyle: 'bold' },
			8: { cellWidth: 24, halign: 'center' }
		}
	});

	const pdfBytes = doc.output('arraybuffer');
	return new Response(pdfBytes, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="PENGAJUAN_ACC_${company.code}_${dateStr}.pdf"`
		}
	});
};
