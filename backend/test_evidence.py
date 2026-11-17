from io import BytesIO
import pytest
from pypdf import PdfWriter
from evidence import validate_file,MAX_FILE_BYTES


def pdf_bytes(encrypted=False,pages=1):
    writer=PdfWriter()
    for _ in range(pages):writer.add_blank_page(width=100,height=100)
    if encrypted:writer.encrypt('test-password')
    buffer=BytesIO();writer.write(buffer);return buffer.getvalue()


def test_pdf_text_content_hash_and_filename_validation():
    from hashlib import sha256
    content=b'SYNTHETIC demonstration evidence\n'
    name,mime,digest=validate_file('sample.txt',content)
    assert name=='sample.txt' and mime.startswith('text/plain') and digest==sha256(content).hexdigest()
    assert validate_file('sample.PDF',pdf_bytes())[1]=='application/pdf'
    for name,content in [('bad.exe',b'abc'),('../file.txt',b'abc'),('C:\\file.txt',b'abc'),('bad\r\nfile.txt',b'abc'),('empty.txt',b''),('binary.txt',b'\x00abc'),('wrong.pdf',b'not a PDF'),('broken.pdf',b'%PDF-broken'),('encrypted.pdf',pdf_bytes(True)),('many.pdf',pdf_bytes(pages=51)),('large.txt',b'x'*(MAX_FILE_BYTES+1))]:
        with pytest.raises(ValueError):validate_file(name,content)


def test_evidence_change_invalidates_review_but_not_general_eligibility():
    from test_workflow import fixture
    from app import eligibility_supplier
    p,suppliers,criteria,weights,_,_,_,_=fixture();supplier={**suppliers[0],'evidence_revision':1}
    criteria={**criteria,'currency':p['currency']};criteria['configuration']['mandatory_checks']=[{'id':'cert','name':'Certificate'}]
    review={'criteria_revision':1,'supplier_updated_at':supplier['updated_at'],'evidence_revision':0,'revision':1,'reviewer':'Demo','updated_at':supplier['updated_at'],'determinations':{'currency':'USD','checks':{'cert':{'status':'passed','notes':'Reviewed'}}}}
    result=eligibility_supplier(supplier,review,criteria)
    assert result['eligibility']=='pending' and result['needs_review']
    criteria['configuration']['mandatory_checks']=[]
    assert eligibility_supplier(supplier,review,criteria)['eligibility']=='eligible'



def test_saved_report_preserves_attachment_identity_and_hash():
    from test_reports import saved
    from reports import report_data,render_pdf
    from pypdf import PdfReader
    from hashlib import sha256
    from uuid import uuid4
    row=saved();document={'id':str(uuid4()),'supplier_id':str(uuid4()),'supplier_name':'Alpha','filename':'synthetic-evidence.txt','check_name':'Demo evidence','size_bytes':32,'sha256':sha256(b'Synthetic file').hexdigest(),'created_at':'2026-11-18T00:00:00Z','uploaded_by':'Demo User (unauthenticated)'}
    row['snapshot']['evidence_files']=[document]
    report=report_data(row);text='\n'.join(p.extract_text() for p in PdfReader(BytesIO(render_pdf(report))).pages)
    assert report['evidence_files']==[document]
    assert document['filename'] in text and document['sha256'] in text and document['id'] in text
