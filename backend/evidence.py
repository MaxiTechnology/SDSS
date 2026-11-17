"""Bounded, opaque supplier evidence storage. File contents never go to AI."""
from hashlib import sha256
from io import BytesIO
from pathlib import PurePath

MAX_FILE_BYTES=2*1024*1024
MAX_PROJECT_BYTES=20*1024*1024
MAX_ACTIVE_FILES=10
MAX_PROJECT_FILES=100
COLUMNS='id,project_id,supplier_id,supplier_name,filename,mime_type,size_bytes,sha256,check_id,check_name,criteria_revision,uploaded_by,created_at,archived_at'


def validate_file(filename,content):
    filename=filename.strip()
    if not filename or len(filename)>180 or any(ord(c)<32 or ord(c)==127 or c in '/\\' for c in filename):
        raise ValueError('Use a filename of at most 180 characters without folders or control characters.')
    if not content:raise ValueError('The document is empty.')
    if len(content)>MAX_FILE_BYTES:raise ValueError('Each document must be 2 MiB or smaller.')
    extension=PurePath(filename).suffix.lower()
    if extension=='.txt':
        try:text=content.decode('utf-8-sig')
        except UnicodeDecodeError:raise ValueError('Text documents must use UTF-8 encoding.') from None
        if not text.strip() or any(ord(c)<32 and c not in '\t\r\n' for c in text):raise ValueError('Choose a nonempty plain UTF-8 text document.')
        mime='text/plain; charset=utf-8'
    elif extension=='.pdf':
        from pypdf import PdfReader
        if not content.startswith(b'%PDF-'):raise ValueError('The file is not a PDF document.')
        try:reader=PdfReader(BytesIO(content),strict=True)
        except Exception:raise ValueError('The PDF could not be read. Choose a valid, unencrypted PDF.') from None
        if reader.is_encrypted:raise ValueError('Password-protected PDFs are not supported.')
        try:pages=len(reader.pages)
        except Exception:raise ValueError('The PDF pages could not be read.') from None
        if not 1<=pages<=50:raise ValueError('Use a PDF containing 1 to 50 pages.')
        mime='application/pdf'
    else:raise ValueError('Supported document types are PDF and plain text (.txt).')
    return filename,mime,sha256(content).hexdigest()


def metadata(row):
    return {'id':str(row['id']),'supplier_id':str(row['supplier_id']),'supplier_name':row['supplier_name'],
            'filename':row['filename'],'mime_type':row['mime_type'],'size_bytes':row['size_bytes'],'sha256':row['sha256'],
            'check_id':row['check_id'],'check_name':row['check_name'],'criteria_revision':row['criteria_revision'],
            'uploaded_by':row['uploaded_by'],'created_at':row['created_at'].isoformat(),
            'archived_at':row['archived_at'].isoformat() if row['archived_at'] else None}
