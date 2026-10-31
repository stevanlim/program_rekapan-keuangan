import mysql from 'mysql2/promise';

const DB_CONFIG = {
	host: 'localhost',
	port: 3306,
	user: 'root',
	password: '',
	database: 'rekapan_finance',
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0,
	decimalNumbers: true
};

let pool: mysql.Pool | null = null;
let initialized = false;

export async function getDb(): Promise<mysql.Pool> {
	if (pool && initialized) return pool;

	// Pastikan database ada
	const rootConn = await mysql.createConnection({
		host: DB_CONFIG.host,
		port: DB_CONFIG.port,
		user: DB_CONFIG.user,
		password: DB_CONFIG.password
	});
	await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
	await rootConn.end();

	if (!pool) pool = mysql.createPool(DB_CONFIG);

	if (!initialized) {
		await initTables(pool);
		await seedMasterData(pool);
		initialized = true;
	}

	return pool;
}

async function initTables(p: mysql.Pool) {
	// Tabel perusahaan (PT)
	await p.query(`
		CREATE TABLE IF NOT EXISTS companies (
			id INT AUTO_INCREMENT PRIMARY KEY,
			code VARCHAR(20) NOT NULL UNIQUE,
			name VARCHAR(150) NOT NULL
		) ENGINE=InnoDB;
	`);

	// Tabel rekanan/supplier (master nama)
	await p.query(`
		CREATE TABLE IF NOT EXISTS contacts (
			id INT AUTO_INCREMENT PRIMARY KEY,
			name VARCHAR(150) NOT NULL,
			type ENUM('supplier','non_vendor') NOT NULL DEFAULT 'supplier',
			UNIQUE KEY uniq_name (name)
		) ENGINE=InnoDB;
	`);

	// Tabel hutang (OS Hutang)
	await p.query(`
		CREATE TABLE IF NOT EXISTS debts (
			id INT AUTO_INCREMENT PRIMARY KEY,
			company_id INT NOT NULL,
			contact_id INT NOT NULL,
			invoice_no VARCHAR(100) NULL,
			invoice_date DATE NOT NULL,
			due_date DATE NULL COMMENT 'NULL = pakai default 30 hari',
			amount DECIMAL(15,2) NOT NULL,
			paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
			description TEXT NOT NULL,
			status ENUM('unpaid','partially_paid','paid') NOT NULL DEFAULT 'unpaid',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (company_id) REFERENCES companies(id),
			FOREIGN KEY (contact_id) REFERENCES contacts(id)
		) ENGINE=InnoDB;
	`);

	// Tabel pelaporan saldo harian per perusahaan
	await p.query(`
		CREATE TABLE IF NOT EXISTS daily_balances (
			id INT AUTO_INCREMENT PRIMARY KEY,
			company_id INT NOT NULL,
			balance_date DATE NOT NULL,
			balance_amount DECIMAL(15,2) NOT NULL,
			notes TEXT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (company_id) REFERENCES companies(id),
			UNIQUE KEY uniq_comp_date (company_id, balance_date)
		) ENGINE=InnoDB;
	`);

	// Tabel histori pembayaran
	await p.query(`
		CREATE TABLE IF NOT EXISTS payments (
			id INT AUTO_INCREMENT PRIMARY KEY,
			debt_id INT NOT NULL,
			company_id INT NOT NULL,
			payment_date DATE NOT NULL,
			amount_paid DECIMAL(15,2) NOT NULL,
			source_fund VARCHAR(100) NOT NULL DEFAULT 'Tunai',
			notes TEXT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (debt_id) REFERENCES debts(id),
			FOREIGN KEY (company_id) REFERENCES companies(id)
		) ENGINE=InnoDB;
	`);
	// Tabel pengguna & sesi
	await p.query(`
		CREATE TABLE IF NOT EXISTS users (
			id INT AUTO_INCREMENT PRIMARY KEY,
			username VARCHAR(50) NOT NULL UNIQUE,
			password_hash VARCHAR(128) NOT NULL,
			pin_hash VARCHAR(128) NOT NULL,
			name VARCHAR(100) NOT NULL,
			role VARCHAR(30) NOT NULL DEFAULT 'admin',
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		) ENGINE=InnoDB;
	`);

	await p.query(`
		CREATE TABLE IF NOT EXISTS sessions (
			id VARCHAR(128) PRIMARY KEY,
			user_id INT NOT NULL,
			expires_at DATETIME NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		) ENGINE=InnoDB;
	`);

	// Migrasi debts: pastikan status mendukung pending_approval dan kolom-kolom persetujuan ada
	try {
		await p.query("ALTER TABLE debts MODIFY COLUMN status ENUM('unpaid','partially_paid','pending_approval','paid') NOT NULL DEFAULT 'unpaid'");
	} catch (err) {
		console.warn('[DB] Status ENUM check warning:', err);
	}

	const [cols]: any = await p.query('SHOW COLUMNS FROM debts');
	const colNames = cols.map((c: any) => c.Field);
	const addColIfMissing = async (name: string, typeSql: string) => {
		if (!colNames.includes(name)) {
			await p.query(`ALTER TABLE debts ADD COLUMN ${name} ${typeSql}`);
		}
	};
	await addColIfMissing('pending_amount', 'DECIMAL(15,2) NULL DEFAULT NULL');
	await addColIfMissing('pending_payment_date', 'DATE NULL DEFAULT NULL');
	await addColIfMissing('pending_source_fund', "VARCHAR(100) NULL DEFAULT 'Tunai'");
	await addColIfMissing('pending_notes', 'TEXT NULL DEFAULT NULL');
	await addColIfMissing('pending_by', 'VARCHAR(100) NULL DEFAULT NULL');
	await addColIfMissing('approved_by', 'VARCHAR(100) NULL DEFAULT NULL');
	await addColIfMissing('approved_at', 'DATETIME NULL DEFAULT NULL');
	await addColIfMissing('rejected_notes', 'TEXT NULL DEFAULT NULL');
	await addColIfMissing('contact_type', "ENUM('supplier','non_vendor') NULL DEFAULT NULL");
}

async function seedMasterData(p: mysql.Pool) {
	const [rows]: any = await p.query('SELECT COUNT(*) as cnt FROM companies');
	if (rows[0].cnt === 0) {
		await p.query(`
			INSERT INTO companies (code, name) VALUES
			('ART', 'PT Anugerah Rezeki Teknindo'),
			('KNM', 'PT Kosan Niaga Makmur')
		`);
		console.log('[DB] Data PT berhasil dibuat.');
	}

	// User seeding dihapus agar registrasi dilakukan secara mandiri oleh Admin dan Boss
}
