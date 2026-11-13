"""Database models. Mirrors the OOAD class diagram (Customer, Prescription,
Sale, SaleItem, Medicine, Batch) and adds Users, Returns, Interactions, Audit."""
from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(10), nullable=False, default="employee")  # admin | employee
    password_hash = db.Column(db.String(255), nullable=False)
    active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.now)

    def set_password(self, raw):
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw):
        return check_password_hash(self.password_hash, raw)

    def to_dict(self):
        return {"id": self.id, "username": self.username, "full_name": self.full_name,
                "role": self.role, "active": self.active}


class Medicine(db.Model):
    __tablename__ = "medicines"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, index=True)
    generic_name = db.Column(db.String(120), nullable=False, index=True)  # active salt
    category = db.Column(db.String(60), nullable=False, default="General")
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)  # default MRP per unit
    gst_rate = db.Column(db.Numeric(4, 1), nullable=False, default=12)  # % included in MRP
    requires_prescription = db.Column(db.Boolean, nullable=False, default=False)
    reorder_level = db.Column(db.Integer, nullable=False, default=20)
    refill_days = db.Column(db.Integer)  # for chronic meds: typical days between refills
    active = db.Column(db.Boolean, nullable=False, default=True)
    batches = db.relationship("Batch", backref="medicine", lazy="select")


class Batch(db.Model):
    __tablename__ = "batches"
    id = db.Column(db.Integer, primary_key=True)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True)
    batch_no = db.Column(db.String(40), nullable=False)
    expiry_date = db.Column(db.Date, nullable=False, index=True)
    quantity = db.Column(db.Integer, nullable=False)
    initial_quantity = db.Column(db.Integer, nullable=False)
    cost_price = db.Column(db.Numeric(10, 2), nullable=False)
    selling_price = db.Column(db.Numeric(10, 2), nullable=False)
    discount_pct = db.Column(db.Integer, nullable=False, default=0)  # clearance discount
    received_at = db.Column(db.DateTime, default=datetime.now)
    __table_args__ = (db.UniqueConstraint("medicine_id", "batch_no", name="uq_med_batch"),)

    @property
    def effective_price(self):
        return round(float(self.selling_price) * (100 - self.discount_pct) / 100, 2)

    @property
    def expired(self):
        return self.expiry_date < date.today()


class Customer(db.Model):
    __tablename__ = "customers"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(15), unique=True, index=True)
    email = db.Column(db.String(120))


class Prescription(db.Model):
    __tablename__ = "prescriptions"
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"))
    doctor_name = db.Column(db.String(100), nullable=False)
    doctor_reg_no = db.Column(db.String(40))
    issued_date = db.Column(db.Date, default=date.today)
    status = db.Column(db.String(15), default="Verified")
    verified_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.now)
    customer = db.relationship("Customer")


class Sale(db.Model):
    __tablename__ = "sales"
    id = db.Column(db.Integer, primary_key=True)
    invoice_no = db.Column(db.String(30), unique=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customers.id"))
    prescription_id = db.Column(db.Integer, db.ForeignKey("prescriptions.id"))
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.now, index=True)
    total = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    gst_included = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    discount_given = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    payment_mode = db.Column(db.String(10), nullable=False, default="Cash")
    status = db.Column(db.String(20), nullable=False, default="Completed")
    customer = db.relationship("Customer")
    prescription = db.relationship("Prescription")
    user = db.relationship("User")
    items = db.relationship("SaleItem", backref="sale", cascade="all, delete-orphan")


class SaleItem(db.Model):
    """One row per (medicine, batch) slice - a sale of 130 tablets split over
    two batches produces two rows. This is what makes invoices batch-aware."""
    __tablename__ = "sale_items"
    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=False, index=True)
    medicine_id = db.Column(db.Integer, db.ForeignKey("medicines.id"), nullable=False, index=True)
    batch_id = db.Column(db.Integer, db.ForeignKey("batches.id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)   # after clearance discount
    mrp = db.Column(db.Numeric(10, 2), nullable=False)
    gst_rate = db.Column(db.Numeric(4, 1), nullable=False, default=0)
    line_total = db.Column(db.Numeric(12, 2), nullable=False)
    returned_qty = db.Column(db.Integer, nullable=False, default=0)
    medicine = db.relationship("Medicine")
    batch = db.relationship("Batch")


class SaleReturn(db.Model):
    __tablename__ = "sale_returns"
    id = db.Column(db.Integer, primary_key=True)
    credit_note_no = db.Column(db.String(30), unique=True)
    sale_id = db.Column(db.Integer, db.ForeignKey("sales.id"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    reason = db.Column(db.String(200))
    restocked = db.Column(db.Boolean, default=True)
    total = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.now)
    lines = db.relationship("ReturnLine", backref="ret", cascade="all, delete-orphan")
    sale = db.relationship("Sale")
    user = db.relationship("User")


class ReturnLine(db.Model):
    __tablename__ = "return_lines"
    id = db.Column(db.Integer, primary_key=True)
    return_id = db.Column(db.Integer, db.ForeignKey("sale_returns.id"), nullable=False)
    sale_item_id = db.Column(db.Integer, db.ForeignKey("sale_items.id"), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False)
    sale_item = db.relationship("SaleItem")


class Interaction(db.Model):
    """Known drug-drug interaction between two generic (salt) names."""
    __tablename__ = "interactions"
    id = db.Column(db.Integer, primary_key=True)
    generic_a = db.Column(db.String(120), nullable=False)
    generic_b = db.Column(db.String(120), nullable=False)
    severity = db.Column(db.String(10), nullable=False, default="Moderate")  # Major|Moderate|Minor
    note = db.Column(db.String(300), nullable=False)


class AuditLog(db.Model):
    __tablename__ = "audit_log"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    action = db.Column(db.String(40), nullable=False, index=True)
    detail = db.Column(db.String(300))
    created_at = db.Column(db.DateTime, default=datetime.now, index=True)
    user = db.relationship("User")
