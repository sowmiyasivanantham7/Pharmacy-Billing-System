"""Load demo data:  python seed.py          (adds data only if the DB is empty)
                   python seed.py --reset  (drops everything and reloads)

Creates 60 days of realistic sales history so the forecast, expiry-risk and
reorder engine have something meaningful to analyse."""
import os, sys, random
from datetime import date, datetime, timedelta
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))
from app import create_app
from models import db, User, Medicine, Batch, Interaction, Sale, SaleItem
from services import billing

# name, generic, category, MRP, GST%, Rx?, reorder level, refill_days, popularity
MEDS = [
    ("Dolo 650", "Paracetamol", "Analgesic", 3.0, 12, False, 150, None, 10),
    ("Crocin 650", "Paracetamol", "Analgesic", 3.4, 12, False, 100, None, 4),
    ("Calpol 500", "Paracetamol", "Analgesic", 2.5, 12, False, 80, None, 3),
    ("Brufen 400", "Ibuprofen", "Analgesic", 2.9, 12, False, 60, None, 4),
    ("Voveran 50", "Diclofenac", "Analgesic", 4.2, 12, False, 50, None, 3),
    ("Ecosprin 75", "Aspirin", "Cardiac", 1.6, 12, False, 80, 30, 3),
    ("Warfarin 5mg", "Warfarin", "Cardiac", 5.5, 12, True, 30, 30, 1),
    ("Clopidogrel 75", "Clopidogrel", "Cardiac", 7.0, 12, True, 40, 30, 1.5),
    ("Amlodipine 5", "Amlodipine", "Cardiac", 3.1, 12, True, 80, 30, 3),
    ("Telma 40", "Telmisartan", "Cardiac", 9.5, 12, True, 60, 30, 2.5),
    ("Losar 50", "Losartan", "Cardiac", 6.2, 12, True, 50, 30, 2),
    ("Atorva 10", "Atorvastatin", "Cardiac", 8.4, 12, True, 60, 30, 2.5),
    ("Glycomet 500", "Metformin", "Diabetes", 2.3, 12, True, 120, 30, 5),
    ("Obimet 500", "Metformin", "Diabetes", 2.0, 12, True, 60, 30, 1.5),
    ("Amaryl 2", "Glimepiride", "Diabetes", 11.0, 12, True, 50, 30, 2),
    ("Thyronorm 50", "Levothyroxine", "Thyroid", 2.8, 12, True, 60, 30, 2.5),
    ("Azithral 500", "Azithromycin", "Antibiotic", 24.0, 12, True, 30, None, 2),
    ("Augmentin 625", "Amoxicillin + Clavulanate", "Antibiotic", 32.0, 12, True, 30, None, 2),
    ("Pan 40", "Pantoprazole", "Gastro", 8.0, 12, False, 60, None, 4),
    ("Pantocid 40", "Pantoprazole", "Gastro", 7.2, 12, False, 40, None, 2),
    ("Omez 20", "Omeprazole", "Gastro", 5.0, 12, False, 50, None, 2.5),
    ("Cetzine 10", "Cetirizine", "Allergy", 2.1, 12, False, 80, None, 4),
    ("Montair LC", "Montelukast + Levocetirizine", "Allergy", 14.0, 12, True, 40, None, 2),
    ("Benadryl Syrup 100ml", "Diphenhydramine", "Cough & Cold", 98.0, 12, False, 15, None, 1.2),
    ("Vicks Action 500", "Paracetamol + Phenylephrine", "Cough & Cold", 4.0, 12, False, 60, None, 2.5),
    ("ORS Powder", "Oral Rehydration Salts", "Rehydration", 21.0, 5, False, 40, None, 2),
    ("Limcee 500", "Vitamin C", "Vitamins", 1.9, 5, False, 80, None, 0.8),
    ("Shelcal 500", "Calcium + Vitamin D3", "Vitamins", 6.5, 12, False, 60, 30, 2),
    ("Becosules", "Vitamin B-Complex", "Vitamins", 3.2, 12, False, 60, None, 2),
    ("Betadine Ointment", "Povidone Iodine", "Topical", 82.0, 12, False, 12, None, 1),
]

# batch layout per medicine: list of (days_to_expiry, units_left). Missing = default.
SCENARIOS = {
    "Benadryl Syrup 100ml": [(18, 60), (400, 30)],       # slow mover, short dated -> High risk
    "Limcee 500": [(45, 300), (500, 100)],               # will not sell before expiry -> loss + clearance
    "Cetzine 10": [(-10, 35), (210, 150)],               # an expired batch is sitting on the shelf
    "Azithral 500": [(150, 14)],                         # low stock -> reorder
    "Pan 40": [],                                        # out of stock -> shows Pantocid as substitute
    "Becosules": [(75, 120), (380, 80)],
    "Betadine Ointment": [(28, 9), (300, 20)],
    "Dolo 650": [(70, 120), (320, 380)],                 # FEFO split demo (120 + 380)
}

INTERACTIONS = [
    ("Warfarin", "Aspirin", "Major", "Both thin the blood. High risk of serious bleeding. Avoid unless the doctor has prescribed both."),
    ("Warfarin", "Ibuprofen", "Major", "NSAIDs raise bleeding risk sharply with warfarin and can irritate the stomach."),
    ("Warfarin", "Diclofenac", "Major", "NSAIDs raise bleeding risk sharply with warfarin."),
    ("Warfarin", "Paracetamol", "Minor", "Regular high-dose paracetamol can raise INR. Monitor if used daily."),
    ("Aspirin", "Ibuprofen", "Moderate", "Ibuprofen can blunt aspirin's heart-protective effect and add stomach risk."),
    ("Aspirin", "Diclofenac", "Moderate", "Two NSAIDs together increase stomach bleeding risk."),
    ("Ibuprofen", "Diclofenac", "Moderate", "Duplicate NSAIDs. Avoid taking both."),
    ("Clopidogrel", "Omeprazole", "Moderate", "Omeprazole can reduce clopidogrel's effect. Pantoprazole is usually preferred."),
    ("Telmisartan", "Ibuprofen", "Moderate", "NSAIDs can weaken the BP-lowering effect and strain the kidneys."),
    ("Losartan", "Ibuprofen", "Moderate", "NSAIDs can weaken the BP-lowering effect and strain the kidneys."),
    ("Levothyroxine", "Calcium + Vitamin D3", "Moderate", "Calcium reduces thyroxine absorption. Take at least 4 hours apart."),
    ("Atorvastatin", "Azithromycin", "Minor", "Small chance of raised statin levels. Report muscle pain."),
    ("Amlodipine", "Atorvastatin", "Minor", "Usually safe. Occasional small rise in statin levels."),
]

DOCTORS = [("Dr. R. Meenakshi", "TN-48213"), ("Dr. K. Suresh", "TN-39120"),
           ("Dr. A. Fathima", "TN-51877"), ("Dr. S. Venkatesh", "TN-40466")]
NAMES = ["Arun Kumar", "Lakshmi Devi", "Mohammed Ismail", "Priya Raman", "Karthik S", "Revathi M",
         "Vijay Anand", "Deepa Nair", "Senthil Murugan", "Kavitha R", "Ganesh Babu", "Nisha Thomas",
         "Rajesh P", "Sumathi K", "Imran Khan", "Divya Bharathi", "Balaji N", "Meena Kumari"]


def seed(reset=False):
    rnd = random.Random(42)
    if reset:
        db.drop_all()
    db.create_all()
    if User.query.first():
        print("Database already has data - use --reset to reload.")
        return

    # users
    for uname, full, role, pw in [("admin", "Saranya (Admin)", "admin", "Admin@123"),
                                  ("sowmiya", "Sowmiya (Pharmacist)", "employee", "Staff@123"),
                                  ("kumar", "Kumar (Counter)", "employee", "Staff@123")]:
        u = User(username=uname, full_name=full, role=role)
        u.set_password(pw)
        db.session.add(u)
    db.session.flush()
    admin = User.query.filter_by(username="admin").first()
    staff = User.query.filter(User.role == "employee").all()

    for a, b, sev, note in INTERACTIONS:
        db.session.add(Interaction(generic_a=a, generic_b=b, severity=sev, note=note))

    today = date.today()
    phones = {n: f"9{rnd.randint(100000000, 999999999)}" for n in NAMES}   # fixed pool of regular customers
    meds, pop = [], {}
    for name, gen, cat, mrp, gst, rx, ro, rf, p in MEDS:
        m = Medicine(name=name, generic_name=gen, category=cat, unit_price=Decimal(str(mrp)), gst_rate=gst,
                     requires_prescription=rx, reorder_level=ro, refill_days=rf)
        db.session.add(m)
        meds.append(m)
        pop[name] = p
    db.session.flush()

    # batches start huge so history can be simulated; real quantities are set afterwards
    layout = {}
    for m in meds:
        spec = SCENARIOS.get(m.name)
        if spec is None:
            spec = [(rnd.randint(110, 260), rnd.randint(60, 160)), (rnd.randint(300, 600), rnd.randint(80, 220))]
        layout[m.id] = spec
        for i, (days, left) in enumerate(spec):
            cost = round(float(m.unit_price) * rnd.uniform(0.62, 0.74), 2)
            db.session.add(Batch(medicine_id=m.id, batch_no=f"{m.name[:3].upper()}{today.year % 100}{i + 1:02d}{rnd.randint(10, 99)}",
                                 expiry_date=today + timedelta(days=days), quantity=100000, initial_quantity=100000,
                                 cost_price=Decimal(str(cost)), selling_price=m.unit_price))
    db.session.commit()

    # ---- simulate 60 days of sales ----
    stockable = [m for m in meds if layout[m.id]]
    weights = [pop[m.name] for m in stockable]
    now = datetime.now()
    for back in range(60, -1, -1):
        day = today - timedelta(days=back)
        for _ in range(3 if back == 0 else rnd.randint(6, 12)):
            when = datetime.combine(day, datetime.min.time()) + timedelta(hours=rnd.randint(9, 20), minutes=rnd.randint(0, 59))
            when = min(when, now - timedelta(minutes=rnd.randint(1, 40))) if back == 0 else when
            cart = {}
            for m in rnd.choices(stockable, weights=weights, k=rnd.randint(1, 3)):
                qty = rnd.choice([5, 10, 10, 15, 20, 30]) if float(m.unit_price) < 12 else rnd.choice([1, 1, 2, 3])
                if m.name == "Dolo 650" and back < 14:
                    qty += 5  # demand rising in the last two weeks
                cart[m.id] = cart.get(m.id, 0) + qty
            needs_rx = any(db.session.get(Medicine, i).requires_prescription for i in cart)
            cust = rx = None
            if needs_rx or rnd.random() < 0.35:
                nm = rnd.choice(NAMES)
                cust = {"name": nm, "phone": phones[nm]}
            if needs_rx:
                d, reg = rnd.choice(DOCTORS)
                rx = {"doctor_name": d, "doctor_reg_no": reg}
            try:
                billing.create_sale(rnd.choice(staff + [admin]), [{"medicine_id": i, "quantity": q} for i, q in cart.items()],
                                    cust, rx, rnd.choice(["Cash", "UPI", "UPI", "Card"]), True, when=when, today=day)
            except billing.BillingError:
                db.session.rollback()

    # chronic patients on monthly refills (some due now -> refill reminders)
    chronic = [("Ramesh Iyer", "9840011223", ["Glycomet 500", "Amlodipine 5"], 29),
               ("Saraswathi P", "9884455667", ["Thyronorm 50", "Shelcal 500"], 30),
               ("Abdul Rahman", "9791122334", ["Telma 40", "Atorva 10"], 33),
               ("Janaki Raman", "9444455566", ["Glycomet 500"], 27),
               ("Geetha Lakshmi", "9003322110", ["Losar 50", "Amaryl 2"], 12)]
    by_name = {m.name: m for m in meds}
    for cname, phone, names, ago in chronic:
        for k in (ago + 30, ago):
            day = today - timedelta(days=k)
            d, reg = rnd.choice(DOCTORS)
            try:
                billing.create_sale(staff[0], [{"medicine_id": by_name[n].id, "quantity": 30} for n in names],
                                    {"name": cname, "phone": phone}, {"doctor_name": d, "doctor_reg_no": reg},
                                    "UPI", True, when=datetime.combine(day, datetime.min.time()) + timedelta(hours=11), today=day)
            except billing.BillingError:
                db.session.rollback()

    # set real on-hand quantities
    for m in meds:
        batches = Batch.query.filter_by(medicine_id=m.id).order_by(Batch.expiry_date).all()
        for b, (days, left) in zip(batches, layout[m.id]):
            sold = db.session.query(db.func.coalesce(db.func.sum(SaleItem.quantity), 0)).filter(SaleItem.batch_id == b.id).scalar()
            b.quantity, b.initial_quantity = left, left + int(sold)
    # a live clearance example
    ben = Batch.query.join(Medicine).filter(Medicine.name == "Betadine Ointment").order_by(Batch.expiry_date).first()
    ben.discount_pct = 20
    db.session.commit()
    print(f"Seeded: {Medicine.query.count()} medicines, {Batch.query.count()} batches, {Sale.query.count()} sales.")
    print("Logins ->  admin / Admin@123   |   sowmiya / Staff@123   |   kumar / Staff@123")


if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        seed(reset="--reset" in sys.argv)
