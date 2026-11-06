import io
import os
import smtplib
import ssl
from datetime import datetime
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from PIL import Image as PILImage

import httpx
from fastapi import BackgroundTasks, FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fpdf import FPDF

app = FastAPI()

# ── Twilio SMS ────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN  = os.environ.get("TWILIO_AUTH_TOKEN",  "")
TWILIO_SENDER      = os.environ.get("TWILIO_SENDER",      "TattLab")
TWILIO_TO          = os.environ.get("TWILIO_TO",          "")

# ── Gmail ─────────────────────────────────────────────────────────────────────
GMAIL_USER            = os.environ.get("GMAIL_USER",           "")
GMAIL_PASSWORD        = os.environ.get("GMAIL_APP_PASSWORD",   "")
NOTIFY_EMAIL          = os.environ.get("NOTIFY_EMAIL",         GMAIL_USER)
NOTIFY_EMAIL_BOOKING  = os.environ.get("NOTIFY_EMAIL_BOOKING", "tattlabstudios@gmail.com")
NOTIFY_EMAIL_FINANCE  = os.environ.get("NOTIFY_EMAIL_FINANCE",  "tlsfinanceform@gmail.com")


def send_email(to: str, subject: str, body: str, attachments: list[tuple[str, bytes]] | None = None):
    msg = MIMEMultipart()
    msg["From"]    = GMAIL_USER
    msg["To"]      = to
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    for filename, data in (attachments or []):
        part = MIMEBase("application", "octet-stream")
        part.set_payload(data)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
        msg.attach(part)
    ctx = ssl.create_default_context()
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ctx) as s:
        s.login(GMAIL_USER, GMAIL_PASSWORD)
        s.sendmail(GMAIL_USER, to, msg.as_string())


def send_sms(body: str):
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN or not TWILIO_TO:
        print("SMS:UNCONFIGURED", flush=True)
        return
    phone = TWILIO_TO.strip().replace(" ", "")
    if phone.startswith("0"):
        phone = "+44" + phone[1:]
    elif not phone.startswith("+"):
        phone = "+" + phone
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
    resp = httpx.post(
        url,
        auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN),
        data={"From": TWILIO_SENDER, "To": phone, "Body": body},
        timeout=10,
    )
    if resp.status_code != 201:
        print(f"SMS failed: {resp.status_code} {resp.text}", flush=True)


# ── PDF ───────────────────────────────────────────────────────────────────────

class TattLabPDF(FPDF):
    # Palette
    _BG    = (16, 8, 32)        # header dark bg
    _PUR   = (124, 58, 237)     # vivid purple
    _PUR_L = (167, 139, 250)    # light purple (header subtext)
    _FLD_B = (248, 245, 255)    # field box fill
    _FLD_E = (218, 202, 250)    # field box border
    _LBL   = (124, 58, 237)     # field label text
    _VAL   = (20, 10, 40)       # field value text

    def header(self):
        self.set_fill_color(*self._BG)
        self.rect(0, 0, 210, 26, style="F")
        self.set_fill_color(*self._PUR)
        self.rect(0, 24, 210, 3, style="F")
        self.set_xy(10, 8)
        self.set_font("Helvetica", "B", 15)
        self.set_text_color(255, 255, 255)
        self.cell(140, 8, "TattLabStudios")
        self.set_font("Helvetica", "", 7.5)
        self.set_text_color(*self._PUR_L)
        self.set_xy(10, 17)
        self.cell(190, 5, "171 Chase Side, Enfield EN2 0PT  ·  @tattlabstudios", align="R")
        self.set_y(34)

    def _space_left(self) -> float:
        return self.h - self.b_margin - self.get_y()

    def _ensure_space(self, needed: float):
        if self._space_left() < needed:
            self.add_page()

    def _sec(self, title: str):
        self._ensure_space(30)  # header bar + at least one field
        self.ln(4)
        y = self.get_y()
        self.set_fill_color(*self._PUR)
        self.rect(10, y, 190, 7.5, style="F")
        self.set_xy(13, y + 1)
        self.set_font("Helvetica", "B", 8)
        self.set_text_color(255, 255, 255)
        self.cell(184, 5.5, title.upper())
        self.set_y(y + 7.5 + 3)

    def _box(self, x: float, y: float, w: float, h: float, label: str, value: str):
        self.set_fill_color(*self._FLD_B)
        self.set_draw_color(*self._FLD_E)
        self.set_line_width(0.2)
        self.rect(x, y, w, h, style="FD")
        self.set_xy(x + 2.5, y + 2)
        self.set_font("Helvetica", "", 6.5)
        self.set_text_color(*self._LBL)
        self.cell(w - 5, 3.5, label.upper())
        self.set_xy(x + 2.5, y + 6.5)
        self.set_font("Helvetica", "B", 9)
        self.set_text_color(*self._VAL)
        self.cell(w - 5, 5, str(value) if value else "-")

    def fld(self, label: str, value: str, h: float = 13):
        self._ensure_space(h + 2)
        y = self.get_y()
        self._box(10, y, 190, h, label, value)
        self.set_y(y + h + 2)

    def fld2(self, label1: str, val1: str, label2: str, val2: str, h: float = 13):
        self._ensure_space(h + 2)
        y = self.get_y()
        self._box(10,  y, 92, h, label1, val1)
        self._box(108, y, 92, h, label2, val2)
        self.set_y(y + h + 2)

    def embed_image(self, title: str, img_bytes: bytes, img_name: str):
        ext = img_name.rsplit(".", 1)[-1].lower() if img_name else ""
        if ext not in ("jpg", "jpeg", "png"):
            self.fld(title, img_name)
            return
        self._sec(title)
        try:
            # Measure image to estimate height, cap at 120mm wide
            self._ensure_space(60)
            self.image(io.BytesIO(img_bytes), x=10, w=120)
            self.ln(3)
        except Exception:
            self.fld(title, img_name)


def _image_fit(img_bytes: bytes, max_w: float = 190, max_h: float = 240) -> tuple[float, float]:
    """Return (w_mm, h_mm) scaled to fill max_w while never exceeding max_h."""
    try:
        img = PILImage.open(io.BytesIO(img_bytes))
        px_w, px_h = img.size
        if px_w == 0 or px_h == 0:
            return max_w, max_h
        ratio = px_h / px_w
        w = max_w
        h = w * ratio
        if h > max_h:
            h = max_h
            w = h / ratio
        return w, h
    except Exception:
        return max_w, max_h


def build_booking_pdf(d: dict, design_bytes: bytes | None, design_name: str | None) -> bytes:
    pdf = TattLabPDF()
    pdf.set_auto_page_break(True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 14)
    pdf.set_text_color(20, 10, 40)
    pdf.cell(0, 8, "Booking Enquiry", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(130, 110, 160)
    pdf.cell(0, 5, f"Received: {datetime.now().strftime('%d %B %Y at %H:%M')}", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    pdf._sec("Client Details")
    pdf.fld2("Full Name", d["name"], "Phone", d["phone"])
    pdf.fld("Email", d["email"])

    pdf._sec("Appointment Details")
    pdf.fld2("Preferred Date", d["preferred_date"], "Size", d["size"])
    pdf.fld2("Placement", d["placement"], "Artist", d["artist"] or "No preference")
    pdf.fld("Contact via", d["contact_method"])

    pdf._sec("Description")
    y = pdf.get_y()
    desc = d["description"]
    est_h = max(20, min(60, len(desc) // 4))
    pdf.set_fill_color(*TattLabPDF._FLD_B)
    pdf.set_draw_color(*TattLabPDF._FLD_E)
    pdf.set_line_width(0.2)
    pdf.rect(10, y, 190, est_h + 8, style="FD")
    pdf.set_xy(12.5, y + 2)
    pdf.set_font("Helvetica", "", 6.5)
    pdf.set_text_color(*TattLabPDF._LBL)
    pdf.cell(0, 3.5, "DESCRIPTION")
    pdf.set_xy(12.5, y + 6.5)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*TattLabPDF._VAL)
    pdf.multi_cell(185, 5, desc)
    pdf.set_y(y + est_h + 10)

    if design_bytes and design_name:
        ext = design_name.rsplit(".", 1)[-1].lower()
        if ext in ("jpg", "jpeg", "png"):
            try:
                pdf.add_page()
                pdf._sec("Design Reference")
                w_mm, h_mm = _image_fit(design_bytes)
                pdf.image(io.BytesIO(design_bytes), x=10, w=w_mm, h=h_mm)
            except Exception:
                pass

    return bytes(pdf.output())


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.post("/submit")
async def submit_booking(
    background_tasks: BackgroundTasks,
    fname:          str = Form(...),
    lname:          str = Form(...),
    email:          str = Form(...),
    phone:          str = Form(...),
    preferred_date: str = Form(...),
    size:           str = Form(...),
    placement:      str = Form(...),
    description:    str = Form(...),
    artist:         str = Form(""),
    contact_method: str = Form(""),
    design: Optional[UploadFile] = File(None),
):
    name = f"{fname} {lname}"
    wa_body = (
        f"🔥 NEW BOOKING — TattLab\n\n"
        f"Name:      {name}\n"
        f"Phone:     {phone}\n"
        f"Email:     {email}\n"
        f"Date:      {preferred_date}\n"
        f"Placement: {placement} ({size})\n\n"
        f"{description[:200]}"
    )

    design_bytes, design_name = None, None
    if design and design.filename:
        design_bytes = await design.read()
        design_name  = design.filename

    pdf_bytes = build_booking_pdf({
        "name": name, "email": email, "phone": phone,
        "preferred_date": preferred_date, "size": size,
        "placement": placement, "description": description,
        "artist": artist, "contact_method": contact_method,
    }, design_bytes, design_name)

    # Build email attachments: PDF + design image if uploaded
    attachments = [(f"booking_{name.replace(' ', '_')}.pdf", pdf_bytes)]
    if design_bytes and design_name:
        attachments.append((design_name, design_bytes))

    try:
        send_sms(wa_body)
    except Exception as e:
        print(f"SMS failed: {e}", flush=True)

    background_tasks.add_task(
        send_email,
        NOTIFY_EMAIL_BOOKING,
        f"Booking Enquiry: {name}",
        wa_body,
        attachments,
    )

    return {"status": "ok"}


@app.post("/submit-klarna")
async def submit_klarna(
    kfname: str = Form(...),
    klname: str = Form(...),
    kphone: str = Form(...),
):
    name = f"{kfname} {klname}"
    body = f"💳 KLARNA REQUEST — TattLab\n\nName:  {name}\nPhone: {kphone}\n\nIssue them a Klarna payment link."
    try:
        send_sms(body)
    except Exception as e:
        print(f"Klarna SMS failed: {e}", flush=True)
    return {"status": "ok"}


@app.post("/submit-finance")
async def submit_finance(
    background_tasks: BackgroundTasks,
    fname:      str = Form(...),
    lname:      str = Form(...),
    email:      str = Form(...),
    phone:      str = Form(...),
    addr1:      str = Form(...),
    postcode:   str = Form(...),
    lived_here: str = Form(...),
    movein:     str = Form(...),
    prev_addr:  str = Form(""),
    prev_movein:str = Form(""),
    months:     str = Form(...),
):
    name = f"{fname} {lname}"
    body = (
        f"💳 FINANCE APPLICATION — TattLab\n\n"
        f"Name:          {name}\n"
        f"Email:         {email}\n"
        f"Phone:         {phone}\n\n"
        f"Address:       {addr1}, {postcode}\n"
        f"Lived there:   {lived_here}\n"
        f"Moved in:      {movein}\n"
    )
    if prev_addr:
        body += f"Prev address:  {prev_addr}\n"
        if prev_movein:
            body += f"Prev moved in: {prev_movein}\n"
    body += f"\nFinance term:  {months} month(s)\n"

    background_tasks.add_task(send_email, NOTIFY_EMAIL_FINANCE, f"Finance Application: {name}", body)

    return {"status": "ok"}


# ── Static serving ────────────────────────────────────────────────────────────

@app.get("/")
def index(): return FileResponse("index.html")

@app.get("/contact")
def contact(): return FileResponse("contact.html")

@app.get("/finance")
def finance(): return FileResponse("finance.html")

# Consent form retired — send old links/bookmarks to the booking page
@app.get("/consent")
def consent(): return RedirectResponse("/contact", status_code=301)

@app.get("/where-are-we")
def where_are_we(): return FileResponse("where-are-we.html")

@app.get("/tattoo-studio-north-london")
def north_london(): return FileResponse("tattoo-studio-north-london.html")

@app.get("/tattoo-studio-edmonton")
def edmonton(): return FileResponse("tattoo-studio-edmonton.html")

@app.get("/tattoo-studio-barnet")
def barnet(): return FileResponse("tattoo-studio-barnet.html")

@app.get("/tattoo-studio-palmers-green")
def palmers_green(): return FileResponse("tattoo-studio-palmers-green.html")

@app.get("/blog")
def blog(): return FileResponse("blog.html")

@app.get("/blog/how-to-choose-your-tattoo-style")
def blog_styles(): return FileResponse("blog/how-to-choose-your-tattoo-style.html")

@app.get("/blog/tattoo-aftercare-guide")
def blog_aftercare(): return FileResponse("blog/tattoo-aftercare-guide.html")

@app.get("/blog/how-much-does-a-tattoo-cost-in-london")
def blog_cost(): return FileResponse("blog/how-much-does-a-tattoo-cost-in-london.html")

@app.get("/llms.txt")
def llms(): return FileResponse("llms.txt", media_type="text/plain; charset=utf-8")

@app.get("/robots.txt")
def robots(): return FileResponse("robots.txt", media_type="text/plain")

@app.get("/sitemap.xml")
def sitemap(): return FileResponse("sitemap.xml", media_type="application/xml")

@app.get("/shared.css")
def shared_css(): return FileResponse("shared.css", media_type="text/css")

app.mount("/assets",  StaticFiles(directory="assets"),  name="assets")
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
