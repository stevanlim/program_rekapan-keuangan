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

	// Ambil saldo terakhir untuk perusahaan ini
	const [balanceRows]: any = await db.query(`
		SELECT balance_amount, DATE_FORMAT(balance_date, '%d/%m/%Y') AS balance_date_fmt
		FROM daily_balances
		WHERE company_id = ?
		ORDER BY balance_date DESC, id DESC LIMIT 1
	`, [company.id]);
	const latestBalance = balanceRows[0];

	// Ambil semua hutang aktif yang belum lunas
	const [debts]: any = await db.query(`
		SELECT 
			d.id, d.contact_id, c.name AS contact_name, COALESCE(d.contact_type, c.type) AS contact_type,
			d.invoice_no,
			DATE_FORMAT(d.invoice_date, '%Y-%m-%d') AS invoice_date,
			DATE_FORMAT(COALESCE(d.due_date, DATE_ADD(d.invoice_date, INTERVAL 30 DAY)), '%Y-%m-%d') AS due_date,
			d.amount, d.paid_amount, (d.amount - d.paid_amount) AS remaining_amount,
			d.description,
			DATEDIFF(CURRENT_DATE(), d.invoice_date) AS days_overdue
		FROM debts d
		JOIN contacts c ON d.contact_id = c.id
		WHERE d.company_id = ? AND d.status != 'paid'
		ORDER BY c.name ASC, d.invoice_date ASC
	`, [company.id]);

	// Format tanggal untuk nama file
	const now = new Date();
	const dateStr = now.toISOString().split('T')[0];

	// ==========================================
	// 1. EXPORT EXCEL (PERSIS DENGAN TEMPLATE ASLI)
	// ==========================================
	if (exportType === 'excel') {
		const wb = new ExcelJS.Workbook();
		const sheetName = `OS HUTANG ${company.code}`;
		const ws = wb.addWorksheet(sheetName, {
			pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true }
		});

		// Lebar kolom sesuai template (Kolom A adalah margin kecil)
		ws.columns = [
			{ width: 3 },  // A
			{ width: 26 }, // B: SUPPLIER / NAMA
			{ width: 14 }, // C: TANGGAL
			{ width: 15 }, // D: INV NO
			{ width: 18 }, // E: JUMLAH
			{ width: 42 }, // F: KETERANGAN
			{ width: 12 }, // G: INTERVAL HARI
			{ width: 18 }, // H: 0-30 HARI
			{ width: 18 }, // I: 31-60 HARI
			{ width: 18 }, // J: 61-90 HARI
			{ width: 18 }, // K: 91-120 HARI
			{ width: 18 }, // L: > 120 HARI
			{ width: 20 }  // M: TOTAL
		];

		// Judul di Row 2
		ws.getCell('B2').value = 'REKAPAN OS HUTANG';
		ws.getCell('B2').font = { bold: true, size: 14, name: 'Calibri' };

		// Nama PT di Row 3
		ws.getCell('B3').value = company.name.toUpperCase();
		ws.getCell('B3').font = { bold: true, size: 12, name: 'Calibri' };

		// Saldo di Row 5
		const saldoNominal = latestBalance?.balance_amount
			? Math.round(latestBalance.balance_amount).toLocaleString('id-ID')
			: '0';
		ws.getCell('B5').value = `SALDO ${company.code} ${latestBalance?.balance_date_fmt || dateStr} : RP ${saldoNominal}`;
		ws.getCell('B5').font = { bold: true, size: 11, color: { argb: 'FF166534' }, name: 'Calibri' };

		// Header Tabel di Row 7
		const headers = [
			'SUPPLIER / PIHAK',
			'TANGGAL',
			'INV NO',
			'JUMLAH',
			'KETERANGAN',
			'INTERVAL HARI',
			'0-30 HARI',
			'31-60 HARI',
			'61-90 HARI',
			'91-120 HARI',
			'> 120 HARI',
			'TOTAL'
		];

		const headerRow = ws.getRow(7);
		headers.forEach((h, idx) => {
			const cell = headerRow.getCell(idx + 2); // B = 2
			cell.value = h;
			cell.font = { bold: true, size: 10, color: { argb: 'FF0F172A' }, name: 'Calibri' };
			cell.alignment = { vertical: 'middle', horizontal: idx === 0 || idx === 4 ? 'left' : 'center' };
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
		headerRow.height = 26;

		// Kelompokkan data per Kontak / Supplier
		const grouped: { [key: string]: any[] } = {};
		debts.forEach((d: any) => {
			const key = d.contact_name;
			if (!grouped[key]) grouped[key] = [];
			grouped[key].push(d);
		});

		let currentRow = 8;
		let grandTotal = 0;
		let grandB0_30 = 0;
		let grandB31_60 = 0;
		let grandB61_90 = 0;
		let grandB91_120 = 0;
		let grandBOver120 = 0;

		const contactNames = Object.keys(grouped);

		contactNames.forEach((contactName) => {
			const items = grouped[contactName];
			let subB0_30 = 0;
			let subB31_60 = 0;
			let subB61_90 = 0;
			let subB91_120 = 0;
			let subBOver120 = 0;
			let subTotal = 0;

			items.forEach((item, itemIdx) => {
				const row = ws.getRow(currentRow);
				const days = Number(item.days_overdue);
				const rem = Number(item.remaining_amount);

				let b0_30 = 0, b31_60 = 0, b61_90 = 0, b91_120 = 0, b_over120 = 0;
				if (days <= 30) b0_30 = rem;
				else if (days <= 60) b31_60 = rem;
				else if (days <= 90) b61_90 = rem;
				else if (days <= 120) b91_120 = rem;
				else b_over120 = rem;

				subB0_30 += b0_30;
				subB31_60 += b31_60;
				subB61_90 += b61_90;
				subB91_120 += b91_120;
				subBOver120 += b_over120;
				subTotal += rem;

				// Kolom B: Nama Supplier (tampil di baris pertama group)
				row.getCell('B').value = itemIdx === 0 ? contactName : '';
				row.getCell('B').font = { bold: itemIdx === 0, size: 10, name: 'Calibri' };

				// Kolom C: Tanggal Bon
				row.getCell('C').value = item.invoice_date;
				row.getCell('C').alignment = { horizontal: 'center' };

				// Kolom D: No Inv
				row.getCell('D').value = item.invoice_no || '';
				row.getCell('D').alignment = { horizontal: 'center' };

				// Kolom E: Jumlah
				row.getCell('E').value = rem;
				row.getCell('E').numFmt = '#,##0';
				row.getCell('E').alignment = { horizontal: 'right' };

				// Kolom F: Keterangan
				row.getCell('F').value = item.description;

				// Kolom G: Interval Hari
				row.getCell('G').value = days;
				row.getCell('G').alignment = { horizontal: 'center' };

				// Aging Columns
				const agingCols = [
					{ col: 'H', val: b0_30 },
					{ col: 'I', val: b31_60 },
					{ col: 'J', val: b61_90 },
					{ col: 'K', val: b91_120 },
					{ col: 'L', val: b_over120 },
					{ col: 'M', val: rem }
				];

				agingCols.forEach(({ col, val }) => {
					const cell = row.getCell(col);
					cell.value = val;
					cell.numFmt = '#,##0';
					cell.alignment = { horizontal: 'right' };
				});

				// Beri border tipis di setiap cell data B s/d M
				for (let c = 2; c <= 13; c++) {
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

			// Baris SUB TOTAL untuk supplier ini
			const subRow = ws.getRow(currentRow);
			subRow.getCell('B').value = 'SUB TOTAL';
			subRow.getCell('B').font = { bold: true, size: 10, name: 'Calibri' };
			subRow.getCell('B').alignment = { horizontal: 'left' };

			const subAgingCols = [
				{ col: 'H', val: subB0_30 },
				{ col: 'I', val: subB31_60 },
				{ col: 'J', val: subB61_90 },
				{ col: 'K', val: subB91_120 },
				{ col: 'L', val: subBOver120 },
				{ col: 'M', val: subTotal }
			];

			subAgingCols.forEach(({ col, val }) => {
				const cell = subRow.getCell(col);
				cell.value = val;
				cell.numFmt = '#,##0';
				cell.font = { bold: true, size: 10, name: 'Calibri' };
				cell.alignment = { horizontal: 'right' };
			});

			// Styling baris Sub Total
			for (let c = 2; c <= 13; c++) {
				const cell = subRow.getCell(c);
				cell.fill = {
					type: 'pattern',
					pattern: 'solid',
					fgColor: { argb: 'FFF8FAFC' }
				};
				cell.border = {
					top: { style: 'thin', color: { argb: 'FF94A3B8' } },
					bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
					left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
					right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
				};
			}

			grandB0_30 += subB0_30;
			grandB31_60 += subB31_60;
			grandB61_90 += subB61_90;
			grandB91_120 += subB91_120;
			grandBOver120 += subBOver120;
			grandTotal += subTotal;

			currentRow++; // Pindah ke baris setelah sub total
			currentRow++; // Spacer row
		});

		// Baris GRAND TOTAL di paling bawah
		const totalRow = ws.getRow(currentRow);
		totalRow.getCell('B').value = 'TOTAL';
		totalRow.getCell('B').font = { bold: true, size: 11, name: 'Calibri' };
		totalRow.getCell('B').alignment = { horizontal: 'left' };

		const grandCols = [
			{ col: 'H', val: grandB0_30 },
			{ col: 'I', val: grandB31_60 },
			{ col: 'J', val: grandB61_90 },
			{ col: 'K', val: grandB91_120 },
			{ col: 'L', val: grandBOver120 },
			{ col: 'M', val: grandTotal }
		];

		grandCols.forEach(({ col, val }) => {
			const cell = totalRow.getCell(col);
			cell.value = val;
			cell.numFmt = '#,##0';
			cell.font = { bold: true, size: 11, name: 'Calibri' };
			cell.alignment = { horizontal: 'right' };
		});

		for (let c = 2; c <= 13; c++) {
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
				'Content-Disposition': `attachment; filename="REKAPAN_OS_HUTANG_${company.code}_${dateStr}.xlsx"`
			}
		});
	}

	// ==========================================
	// 2. EXPORT PDF (PERSIS DENGAN LAPORAN ASLI)
	// ==========================================
	const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

	// Header Laporan
	doc.setFontSize(14);
	doc.setFont('helvetica', 'bold');
	doc.text('REKAPAN OS HUTANG', 14, 14);

	doc.setFontSize(11);
	doc.text(company.name.toUpperCase(), 14, 20);

	doc.setFontSize(9.5);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(22, 101, 52);
	const saldoStr = latestBalance?.balance_amount
		? 'Rp. ' + Math.round(latestBalance.balance_amount).toLocaleString('id-ID')
		: 'Rp. 0';
	doc.text(`SALDO ${company.code} ${latestBalance?.balance_date_fmt || dateStr} : ${saldoStr}`, 14, 26);
	doc.setTextColor(0, 0, 0);

	// Persiapkan data tabel dengan Sub Total
	const tableBody: any[] = [];
	const grouped: { [key: string]: any[] } = {};
	debts.forEach((d: any) => {
		const key = d.contact_name;
		if (!grouped[key]) grouped[key] = [];
		grouped[key].push(d);
	});

	let grandTotal = 0;
	let grandB0_30 = 0;
	let grandB31_60 = 0;
	let grandB61_90 = 0;
	let grandB91_120 = 0;
	let grandBOver120 = 0;

	Object.keys(grouped).forEach((contactName) => {
		const items = grouped[contactName];
		let subB0_30 = 0;
		let subB31_60 = 0;
		let subB61_90 = 0;
		let subB91_120 = 0;
		let subBOver120 = 0;
		let subTotal = 0;

		items.forEach((item, itemIdx) => {
			const days = Number(item.days_overdue);
			const rem = Number(item.remaining_amount);

			let b0_30 = 0, b31_60 = 0, b61_90 = 0, b91_120 = 0, b_over120 = 0;
			if (days <= 30) b0_30 = rem;
			else if (days <= 60) b31_60 = rem;
			else if (days <= 90) b61_90 = rem;
			else if (days <= 120) b91_120 = rem;
			else b_over120 = rem;

			subB0_30 += b0_30;
			subB31_60 += b31_60;
			subB61_90 += b61_90;
			subB91_120 += b91_120;
			subBOver120 += b_over120;
			subTotal += rem;

			tableBody.push([
				itemIdx === 0 ? contactName : '',
				item.invoice_date,
				item.invoice_no || '-',
				rem.toLocaleString('id-ID'),
				item.description,
				days.toString(),
				b0_30 ? b0_30.toLocaleString('id-ID') : '0',
				b31_60 ? b31_60.toLocaleString('id-ID') : '0',
				b61_90 ? b61_90.toLocaleString('id-ID') : '0',
				b91_120 ? b91_120.toLocaleString('id-ID') : '0',
				b_over120 ? b_over120.toLocaleString('id-ID') : '0',
				rem.toLocaleString('id-ID')
			]);
		});

		// Row Sub Total
		tableBody.push([
			{ content: 'SUB TOTAL', colSpan: 6, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
			{ content: subB0_30.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } },
			{ content: subB31_60.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } },
			{ content: subB61_90.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } },
			{ content: subB91_120.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } },
			{ content: subBOver120.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } },
			{ content: subTotal.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } }
		]);

		grandB0_30 += subB0_30;
		grandB31_60 += subB31_60;
		grandB61_90 += subB61_90;
		grandB91_120 += subB91_120;
		grandBOver120 += subBOver120;
		grandTotal += subTotal;
	});

	// Row Grand Total
	tableBody.push([
		{ content: 'TOTAL', colSpan: 6, styles: { fontStyle: 'bold', fillColor: [226, 232, 240] } },
		{ content: grandB0_30.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [226, 232, 240] } },
		{ content: grandB31_60.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [226, 232, 240] } },
		{ content: grandB61_90.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [226, 232, 240] } },
		{ content: grandB91_120.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [226, 232, 240] } },
		{ content: grandBOver120.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [226, 232, 240] } },
		{ content: grandTotal.toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'right', fillColor: [226, 232, 240] } }
	]);

	autoTable(doc, {
		startY: 30,
		head: [[
			'SUPPLIER / PIHAK',
			'TANGGAL',
			'INV NO',
			'JUMLAH',
			'KETERANGAN',
			'HARI',
			'0-30 HARI',
			'31-60 HARI',
			'61-90 HARI',
			'91-120 HARI',
			'> 120 HARI',
			'TOTAL'
		]],
		body: tableBody,
		theme: 'grid',
		headStyles: {
			fillColor: [15, 23, 42],
			textColor: [255, 255, 255],
			fontStyle: 'bold',
			fontSize: 7.5,
			halign: 'center'
		},
		styles: {
			fontSize: 7,
			cellPadding: 1.2,
			textColor: [15, 23, 42],
			lineColor: [203, 213, 225],
			lineWidth: 0.1
		},
		columnStyles: {
			0: { cellWidth: 35 },
			1: { cellWidth: 16, halign: 'center' },
			2: { cellWidth: 18, halign: 'center' },
			3: { cellWidth: 20, halign: 'right' },
			4: { cellWidth: 'auto' },
			5: { cellWidth: 10, halign: 'center' },
			6: { cellWidth: 18, halign: 'right' },
			7: { cellWidth: 18, halign: 'right' },
			8: { cellWidth: 18, halign: 'right' },
			9: { cellWidth: 18, halign: 'right' },
			10: { cellWidth: 18, halign: 'right' },
			11: { cellWidth: 22, halign: 'right' }
		}
	});

	const pdfBytes = doc.output('arraybuffer');
	return new Response(pdfBytes, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="REKAPAN_OS_HUTANG_${company.code}_${dateStr}.pdf"`
		}
	});
};
