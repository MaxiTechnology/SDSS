"""Same-origin production entry point; local development still uses app:app."""
import os
from pathlib import Path
from deployment_config import resolve_environment,validate_environment


resolve_environment(os.environ)
validate_environment(os.environ)
from app import app
from fastapi.staticfiles import StaticFiles

frontend=Path(__file__).resolve().parent/'frontend_dist'
if not (frontend/'index.html').is_file():
    raise RuntimeError('The built frontend is missing; deploy using the repository Dockerfile.')


@app.middleware('http')
async def production_headers(request,call_next):
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='same-origin'
    response.headers['Strict-Transport-Security']='max-age=31536000'
    if not request.url.path.startswith('/assets/'):
        response.headers['Cache-Control']='no-store'
    return response


# API routes have already been registered. Hash-based frontend routes need only
# the root index; arbitrary filesystem paths and local settings are never served.
app.mount('/',StaticFiles(directory=frontend,html=True),name='frontend')
