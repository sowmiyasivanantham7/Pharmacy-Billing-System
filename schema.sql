-- PharmaSense - MySQL schema (MySQL 8 / MariaDB 10.5+)
-- Usage:  mysql -u root -p < database/schema.sql
-- The Flask app can also create these tables itself (db.create_all()); this file is
-- provided for the project report / viva and for manual setup.

CREATE DATABASE IF NOT EXISTS pharmasense CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE pharmasense;

CREATE TABLE customers (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(100) NOT NULL, 
	phone VARCHAR(15), 
	email VARCHAR(120), 
	PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_customers_phone ON customers (phone);

CREATE TABLE interactions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	generic_a VARCHAR(120) NOT NULL, 
	generic_b VARCHAR(120) NOT NULL, 
	severity VARCHAR(10) NOT NULL, 
	note VARCHAR(300) NOT NULL, 
	PRIMARY KEY (id)
);


CREATE TABLE medicines (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	name VARCHAR(120) NOT NULL, 
	generic_name VARCHAR(120) NOT NULL, 
	category VARCHAR(60) NOT NULL, 
	unit_price NUMERIC(10, 2) NOT NULL, 
	gst_rate NUMERIC(4, 1) NOT NULL, 
	requires_prescription BOOL NOT NULL, 
	reorder_level INTEGER NOT NULL, 
	refill_days INTEGER, 
	active BOOL NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX ix_medicines_generic_name ON medicines (generic_name);
CREATE INDEX ix_medicines_name ON medicines (name);

CREATE TABLE users (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	username VARCHAR(50) NOT NULL, 
	full_name VARCHAR(100) NOT NULL, 
	`role` VARCHAR(10) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	active BOOL NOT NULL, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	UNIQUE (username)
);


CREATE TABLE audit_log (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER, 
	action VARCHAR(40) NOT NULL, 
	detail VARCHAR(300), 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_audit_log_action ON audit_log (action);
CREATE INDEX ix_audit_log_created_at ON audit_log (created_at);

CREATE TABLE batches (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	medicine_id INTEGER NOT NULL, 
	batch_no VARCHAR(40) NOT NULL, 
	expiry_date DATE NOT NULL, 
	quantity INTEGER NOT NULL, 
	initial_quantity INTEGER NOT NULL, 
	cost_price NUMERIC(10, 2) NOT NULL, 
	selling_price NUMERIC(10, 2) NOT NULL, 
	discount_pct INTEGER NOT NULL, 
	received_at DATETIME, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_med_batch UNIQUE (medicine_id, batch_no), 
	FOREIGN KEY(medicine_id) REFERENCES medicines (id)
);

CREATE INDEX ix_batches_expiry_date ON batches (expiry_date);
CREATE INDEX ix_batches_medicine_id ON batches (medicine_id);

CREATE TABLE prescriptions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	customer_id INTEGER, 
	doctor_name VARCHAR(100) NOT NULL, 
	doctor_reg_no VARCHAR(40), 
	issued_date DATE, 
	status VARCHAR(15), 
	verified_by INTEGER, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(verified_by) REFERENCES users (id)
);


CREATE TABLE sales (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	invoice_no VARCHAR(30), 
	customer_id INTEGER, 
	prescription_id INTEGER, 
	user_id INTEGER NOT NULL, 
	created_at DATETIME, 
	total NUMERIC(12, 2) NOT NULL, 
	gst_included NUMERIC(12, 2) NOT NULL, 
	discount_given NUMERIC(12, 2) NOT NULL, 
	payment_mode VARCHAR(10) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (invoice_no), 
	FOREIGN KEY(customer_id) REFERENCES customers (id), 
	FOREIGN KEY(prescription_id) REFERENCES prescriptions (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_sales_created_at ON sales (created_at);
CREATE INDEX ix_sales_user_id ON sales (user_id);

CREATE TABLE sale_items (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	sale_id INTEGER NOT NULL, 
	medicine_id INTEGER NOT NULL, 
	batch_id INTEGER NOT NULL, 
	quantity INTEGER NOT NULL, 
	unit_price NUMERIC(10, 2) NOT NULL, 
	mrp NUMERIC(10, 2) NOT NULL, 
	gst_rate NUMERIC(4, 1) NOT NULL, 
	line_total NUMERIC(12, 2) NOT NULL, 
	returned_qty INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(sale_id) REFERENCES sales (id), 
	FOREIGN KEY(medicine_id) REFERENCES medicines (id), 
	FOREIGN KEY(batch_id) REFERENCES batches (id)
);

CREATE INDEX ix_sale_items_medicine_id ON sale_items (medicine_id);
CREATE INDEX ix_sale_items_sale_id ON sale_items (sale_id);

CREATE TABLE sale_returns (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	credit_note_no VARCHAR(30), 
	sale_id INTEGER NOT NULL, 
	user_id INTEGER NOT NULL, 
	reason VARCHAR(200), 
	restocked BOOL, 
	total NUMERIC(12, 2) NOT NULL, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	UNIQUE (credit_note_no), 
	FOREIGN KEY(sale_id) REFERENCES sales (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);

CREATE INDEX ix_sale_returns_sale_id ON sale_returns (sale_id);

CREATE TABLE return_lines (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	return_id INTEGER NOT NULL, 
	sale_item_id INTEGER NOT NULL, 
	quantity INTEGER NOT NULL, 
	amount NUMERIC(12, 2) NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(return_id) REFERENCES sale_returns (id), 
	FOREIGN KEY(sale_item_id) REFERENCES sale_items (id)
);


-- ---------------------------------------------------------------
-- Handy reporting views (optional)
-- ---------------------------------------------------------------
-- Sellable stock per medicine (expired batches excluded) - what Smart FEFO sees.
CREATE OR REPLACE VIEW v_valid_stock AS
SELECT m.id AS medicine_id, m.name, m.generic_name,
       COALESCE(SUM(b.quantity), 0) AS valid_qty, MIN(b.expiry_date) AS next_expiry
FROM medicines m
LEFT JOIN batches b ON b.medicine_id = m.id AND b.quantity > 0 AND b.expiry_date >= CURDATE()
GROUP BY m.id, m.name, m.generic_name;

-- Batches already expired but still on the shelf (write-off list).
CREATE OR REPLACE VIEW v_expired_stock AS
SELECT m.name, b.batch_no, b.expiry_date, b.quantity, b.quantity * b.cost_price AS value_at_cost
FROM batches b JOIN medicines m ON m.id = b.medicine_id
WHERE b.quantity > 0 AND b.expiry_date < CURDATE();

-- Daily sales summary.
CREATE OR REPLACE VIEW v_daily_sales AS
SELECT DATE(created_at) AS day, COUNT(*) AS bills, SUM(total) AS revenue
FROM sales GROUP BY DATE(created_at);
