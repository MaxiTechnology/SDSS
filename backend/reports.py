"""Report projection and PDF export of one immutable decision; no live draft reads."""
from datetime import timezone
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

LABELS = {'approve': 'Recommended supplier approved', 'alternative': 'Alternative supplier approved', 'defer': 'Purchase deferred - no award'}


def sensitivity_text(snapshot):
    scenarios=snapshot.get('sensitivity_scenarios',[])
    if not scenarios:
        return 'No sensitivity findings were saved with this decision; no conclusion about ranking stability can be inferred from this report.'
    baseline=snapshot['ranking']
    leaders=lambda rows: sorted(r['id'] for r in rows if r['rank']==1)
    names={c['id']:c['name'] for c in baseline['criteria']}
    lines=['Saved weight scenarios for this decision baseline. These are selected tests, not proof of stability across all possible weights. Approved weights and the purchasing decision are unchanged by simulation.']
    for scenario in scenarios:
        same=leaders(baseline['result']['rows'])==leaders(scenario['result']['rows'])
        lines.extend([f"Scenario: {scenario['name']} | Saved: {scenario['created_at']} | By: {scenario['actor']}",
                      'Weights: '+ '; '.join(f"{names.get(k,k)}: {v}%" for k,v in scenario['weights'].items()),
                      'Highest-ranked supplier set '+('unchanged.' if same else 'changed.'),
                      'Results: '+ '; '.join(f"{r['name']}: baseline rank {next(b['rank'] for b in baseline['result']['rows'] if b['id']==r['id'])}, scenario rank {r['rank']}, score {Decimal(str(r['score'])):.6f}" for r in scenario['result']['rows']),
                      'Notes: '+(scenario['notes'] or 'No additional notes.')])
    return '\n'.join(lines)


def report_data(row):
    snapshot = row['snapshot']; ranking = snapshot['ranking']; project = snapshot['project']
    leaders = [r['name'] for r in ranking['result']['rows'] if r['rank'] == 1]
    criteria = ranking['criteria']
    eligibility = snapshot.get('eligibility')
    eligibility_notes = []
    if eligibility:
        config = eligibility['configuration']
        names = {c['id']: c['name'] for c in config['mandatory_checks']}
        eligibility_notes.append('Mandatory maximum price: ' + str(config['maximum_price'] if config.get('maximum_price') is not None else 'Not enabled'))
        for supplier in eligibility['suppliers']:
            eligibility_notes.append(f"{supplier['name']}: {supplier['eligibility']}. Reviewer: {supplier.get('reviewer') or 'No evidence review required'}. Reviewed: {supplier.get('reviewed_at') or 'Not recorded'}.")
            for cid, check in supplier['checks'].items():
                eligibility_notes.append(f"{names.get(cid, cid)}: {check['status']}. {check['notes']}")
    else:
        eligibility_notes.append('The ranked suppliers belonged to the eligible pool at calculation. Detailed eligibility rules and review notes were not captured in this older decision snapshot; current reviews have not been substituted.')
    return {
        'id': str(row['id']), 'project_id': str(row['project_id']), 'version': row['version'],
        'ranking_id': str(row['ranking_id']), 'created_at': row['created_at'].isoformat(),
        'confirmed_at': row['created_at'].astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC'), 'actor': row['actor'],
        'title': 'Deferral Record' if snapshot['action'] == 'defer' else 'Purchasing Decision Report',
        'outcome': LABELS[snapshot['action']], 'selected_supplier': snapshot['supplier']['name'] if snapshot['supplier'] else None,
        'recommendation': ', '.join(leaders) + (' (tied highest score; no single recommendation)' if len(leaders) > 1 else ''),
        'project': project, 'reference': snapshot.get('reference', str(row['project_id'])),
        'reason': snapshot['reason'] or 'No additional notes recorded.',
        'revision_reason': snapshot['revision_reason'] or 'Not a revision.',
        'method': ranking.get('method', 'TOPSIS vector normalization v1'),
        'weight_method': snapshot.get('weight_method', 'Approved percentage weights; weighting source was not recorded in this older snapshot.'),
        'weight_diagnostics': snapshot.get('weight_provenance', {}).get('result'),
        'ai_assistance': ({**snapshot['weight_provenance']['suggestion'],'review_notes':snapshot['weight_provenance'].get('notes','')} if snapshot.get('weight_provenance',{}).get('suggestion') else None),
        'criteria': [{**c, 'weight': ranking['weights'][c['id']]} for c in criteria],
        'rankings': ranking['result']['rows'],
        'values': [{'supplier': s['name'], 'criterion': c['name'], 'unit': c['unit'], 'value': ranking['entries'][s['id']][c['id']]} for s in ranking['suppliers'] for c in criteria],
        'eligibility_notes': eligibility_notes,
        'evidence_files': snapshot.get('evidence_files',[]),
        'evidence_note': ('Evidence attachments were not captured in this older decision snapshot.' if 'evidence_files' not in snapshot else 'File metadata below was recorded at confirmation; later file changes do not alter this saved record.' if snapshot['evidence_files'] else 'No evidence attachments were recorded at confirmation.'),
        'sensitivity': sensitivity_text(snapshot),
        'notice': ('Synthetic-data demonstration. Recorded by a signed-in account; this is not a purchase order. ' if snapshot.get('actor_id') else 'Synthetic-data demonstration. Recorded as an unauthenticated demo user; this is not a purchase order. ')+'This report reproduces a saved version and does not certify that it is the latest decision or that current inputs are unchanged.',
    }


def render_pdf(report):
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_LEFT
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, LongTable, TableStyle
    fonts = Path(__file__).parent / 'assets' / 'fonts'
    # Fonts ship with the application under the SIL Open Font License.
    if 'SDSS' not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont('SDSS', str(fonts / 'NotoSans-Regular.ttf')))
        pdfmetrics.registerFont(TTFont('SDSSBold', str(fonts / 'NotoSans-Bold.ttf')))
        pdfmetrics.registerFontFamily('SDSS', normal='SDSS', bold='SDSSBold')
    def strings(value):
        if isinstance(value, str): yield value
        elif isinstance(value, dict):
            for item in value.values(): yield from strings(item)
        elif isinstance(value, list):
            for item in value: yield from strings(item)
    cmap = pdfmetrics.getFont('SDSS').face.charToGlyph
    if any(ord(c) not in cmap and not c.isspace() for text in strings(report) for c in text):
        raise ValueError('PDF export cannot display some characters in this record. View the saved report in the browser instead.')
    styles = getSampleStyleSheet()
    for name in ['Normal','BodyText','Title','Heading1','Heading2']:
        styles[name].fontName = 'SDSS'
    styles['BodyText'].fontSize = 9; styles['BodyText'].leading = 12; styles['BodyText'].spaceBefore = 2
    styles['Title'].fontName = 'SDSSBold'; styles['Title'].fontSize = 22; styles['Title'].leading = 28; styles['Title'].alignment = TA_LEFT
    styles['Heading2'].fontName = 'SDSSBold'; styles['Heading2'].fontSize = 12; styles['Heading2'].spaceBefore = 8; styles['Heading2'].keepWithNext = True
    cellstyle = ParagraphStyle('cell', parent=styles['BodyText'], fontSize=8, leading=12, spaceAfter=0, splitLongWords=True)
    def p(value, style='BodyText'):
        return Paragraph(escape(str(value if value is not None else 'Not specified')).replace('\n', '<br/>'), styles[style])
    story = [p('SSDSS / SUPPLIER SELECTION DECISION SUPPORT SYSTEM'), p(report['title'], 'Title'), p(report['outcome'], 'Heading2')]
    def section(title, texts):
        story.append(p(title, 'Heading2'))
        for value in texts: story.extend([p(value), Spacer(1,3)])
    def table(headers, rows, widths):
        data = [[Paragraph(escape(str(c)),cellstyle) for c in row] for row in [headers]+rows]
        t = LongTable(data, colWidths=widths, repeatRows=1, hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e9effb')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),0.3,colors.HexColor('#dce2ed')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)]))
        story.append(t)
    project = report['project']
    section('Decision record', [f"Project: {project['name']}", f"Reference: {report['reference']}", f"Decision version: {report['version']} | Confirmed: {report['confirmed_at']}",f"Recorded by: {report['actor']}",f"Decision ID: {report['id']}",f"Calculation ID: {report['ranking_id']}",f"Highest-ranked: {report['recommendation']}",f"Selected supplier: {report['selected_supplier'] or 'None - no award'}",f"Notes / justification: {report['reason']}",f"Revision reason: {report['revision_reason']}"])
    section('Project and commercial basis',[f"Category: {project.get('category') or 'Not specified'} | Currency: {project['currency']}",f"Planning budget: {project.get('estimated_budget') if project.get('estimated_budget') is not None else 'Not specified'} | Target date: {project.get('target_date') or 'Not specified'}", project.get('description') or 'No project description recorded.'])
    section('Saved supplier rankings',['Scores range from 0 to 1. Higher is better. Displayed scores are rounded to six decimal places; saved ranks use unrounded scores.'])
    table(['Rank','Supplier','TOPSIS score'],[[r['rank'],r['name'],f"{Decimal(r['score']):.6f}"] for r in report['rankings']],[40,365,100])
    section('Criteria and approved weights',[report['method'], report['weight_method']])
    if report.get('weight_diagnostics'):
        d=report['weight_diagnostics']
        section('AHP consistency', [f"CR: {Decimal(d['cr']):.6f} | CI: {Decimal(d['ci']):.6f} | RI: {Decimal(d['ri']):.2f} | Lambda max: {Decimal(d['lambda_max']):.6f}", d['method'], 'Diagnostics display rounded values; approval uses the unrounded consistency ratio.'])
    table(['Criterion','Unit','Preference','Weight (%)'],[[c['name'],c['unit'],'Lower is better' if c['direction']=='cost' else 'Higher is better',c['weight']] for c in report['criteria']],[185,90,140,90])
    section('Saved supplier input values',['Prices and other commercial values below reproduce the saved evaluation matrix. Units are those configured for this project.'])
    table(['Supplier','Criterion','Value','Unit'],[[v['supplier'],v['criterion'],v['value'],v['unit']] for v in report['values']],[155,175,80,95])
    if report.get('ai_assistance'):
        a=report['ai_assistance']
        section('AI assistance - reviewed by a human', [f"Provider: {a['provider']} | Model: {a['model']}",f"Purchasing priorities sent: {a['priorities']}", a['summary'], 'Explanations describe the original AI suggestions. Approved weights may have been adjusted by the reviewer.',f"Review notes: {a['review_notes'] or 'No additional review notes.'}"])
        for c in report['criteria']:
            section(c['name'], [f"Original AI weight: {a['weights'][c['id']]}% | Approved weight: {c['weight']}%", a['rationales'][c['id']]])
    section('Evidence files recorded with this decision', [report['evidence_note']])
    for file in report['evidence_files']:
        section(file['filename'], [f"Supplier: {file['supplier_name']} | Requirement: {file['check_name'] or 'General supplier evidence'}", f"File ID: {file['id']} | Size: {file['size_bytes']} bytes", f"SHA-256: {file['sha256']}", f"Uploaded: {file['created_at']} | By: {file['uploaded_by']}"])
    section('Eligibility at confirmation', report['eligibility_notes'])
    section('Sensitivity analysis', report['sensitivity'].split('\n'))
    section('Report limitations', [report['notice']])
    buffer = BytesIO()
    def footer(canvas, doc):
        canvas.saveState(); canvas.setFont('SDSS',8); canvas.setFillColor(colors.HexColor('#52617b'))
        canvas.drawString(45,27,f"SSDSS | Decision version {report['version']} | Synthetic data")
        canvas.drawRightString(550,27,f'Page {doc.page}'); canvas.restoreState()
    doc = SimpleDocTemplate(buffer, pagesize=(595.28,841.89), rightMargin=45,leftMargin=45,topMargin=40,bottomMargin=46,title=report['title'],author='SSDSS demonstration')
    doc.build(story,onFirstPage=footer,onLaterPages=footer)
    return buffer.getvalue()
