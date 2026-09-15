"""Generate the public rules PDF from the same approved copy as the website.
Requires reportlab and DejaVu Sans. Run from the repository root.
"""
from pathlib import Path
import html
import re
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

for name, filename in [('Dino', 'DejaVuSans.ttf'), ('DinoBold', 'DejaVuSans-Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name, '/usr/share/fonts/truetype/dejavu/' + filename))
styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='TitleDino', fontName='DinoBold', fontSize=25, leading=30, textColor=HexColor('#800020'), spaceAfter=12))
styles.add(ParagraphStyle(name='HeadingDino', fontName='DinoBold', fontSize=14, leading=18, textColor=HexColor('#800020'), spaceBefore=13, spaceAfter=8, keepWithNext=True))
styles.add(ParagraphStyle(name='BodyDino', fontName='Dino', fontSize=9.5, leading=14, spaceAfter=7))
body = styles['BodyDino']
source = Path('lib/fantasy.ts').read_text()
sections = [(title, re.findall(r"    '([^\n]+)',", content)) for title, content in re.findall(r"\{ title: '([^']+)', items: \[(.*?)\] \}", source, re.S)]
assert len(sections) == 6
path = Path('public/documents/20260915-Dino-Coach-Rules-Rev00.pdf')
path.parent.mkdir(parents=True, exist_ok=True)
flow = [Image('public/images/logo.jpg', width=95, height=95*896/1184), Spacer(1, 12), Paragraph('Dino Coach', styles['TitleDino']), Paragraph('Rules and manager guide | 2026/2027', styles['HeadingDino']), Paragraph('Rules version 2026-27-rev04 | 15 September 2026', body)]
table = Table([['ENTRY', 'SQUAD BUDGET', 'WINNER'], ['AUD 25', '10 million Dino Dollars', '300 Dino Dollars']], colWidths=[90, 225, 180])
table.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,0), HexColor('#800020')), ('TEXTCOLOR', (0,0), (-1,0), white), ('BACKGROUND', (0,1), (-1,1), HexColor('#FFF4D6')), ('FONTNAME', (0,0), (-1,0), 'DinoBold'), ('FONTNAME', (0,1), (-1,1), 'Dino'), ('FONTSIZE', (0,0), (-1,-1), 9), ('TOPPADDING', (0,0), (-1,-1), 10), ('BOTTOMPADDING', (0,0), (-1,-1), 10)]))
flow += [Spacer(1, 10), table]
for title, items in sections:
    if title in ('Scoring', 'Standings'):
        flow.append(PageBreak())
    flow.append(Paragraph(html.escape(title), styles['HeadingDino']))
    for item in items:
        flow.append(Paragraph(html.escape(item), body))
flow += [Paragraph('Quick start', styles['HeadingDino'])]
for text in ['1. Visit www.ndcc.com.au/fantasy and create your manager account. You must be at least 18.', '2. Confirm your email, accept the rules and pay the AUD 25 entry fee.', '3. Select all 15 squad slots within 10 million Dino Dollars. Choose different starting players as captain and vice-captain, then submit your squad.', '4. Use My squad and Transfers to manage your team during the open transfer window. Follow Player Standings for real cricketers and Manager Standings for your fantasy competition.', '5. Use Add Dino Coach to your home screen on the website. On iPhone, open in Safari and choose Share > Add to Home Screen. On Android, use Chrome > Install app or Add to Home screen. An internet connection is required.']:
    flow.append(Paragraph(html.escape(text), body))
flow += [Paragraph('Help and current rules', styles['HeadingDino']), Paragraph('The website carries the current rules. Material changes are recorded and communicated. For help, visit <link href="https://www.ndcc.com.au/contact" color="#800020">www.ndcc.com.au/contact</link>.', body)]
def footer(canvas, doc):
    canvas.setStrokeColor(HexColor('#D4AF37'))
    canvas.setLineWidth(2)
    canvas.line(48, 36, A4[0]-48, 36)
    canvas.setFont('Dino', 7)
    canvas.setFillColor(HexColor('#800020'))
    canvas.drawString(48, 23, 'NDCC | Dino Coach | 2026-27-rev04')
    canvas.drawRightString(A4[0]-48, 23, str(doc.page))
SimpleDocTemplate(str(path), pagesize=A4, rightMargin=48, leftMargin=48, topMargin=38, bottomMargin=48, title='Dino Coach - Rules and manager guide', author='Newcomb and District Cricket Club').build(flow, onFirstPage=footer, onLaterPages=footer)
print(path)
