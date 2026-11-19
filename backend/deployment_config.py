"""Deployment validation without reading private local configuration."""
from urllib.parse import urlsplit,parse_qs


def resolve_environment(environment):
    """Resolve only Render's operator-provided runtime URL, never request headers."""
    if environment.get('SDSS_ALLOWED_ORIGINS')!='render':return
    address=environment.get('RENDER_EXTERNAL_URL','')
    parsed=urlsplit(address)
    if environment.get('RENDER')!='true' or parsed.scheme!='https' or not parsed.hostname \
        or not parsed.hostname.endswith('.onrender.com') or parsed.netloc!=parsed.hostname \
        or parsed.path or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise RuntimeError('Render origin mode requires its assigned HTTPS RENDER_EXTERNAL_URL.')
    environment['SDSS_ALLOWED_ORIGINS']=address


def validate_environment(environment):
    database_url=environment.get('DATABASE_URL','')
    if not database_url:
        raise RuntimeError('Production requires DATABASE_URL; local settings are never a deployment fallback.')
    parsed=urlsplit(database_url)
    if parsed.scheme not in ('postgres','postgresql') or not parsed.hostname:
        raise RuntimeError('Production DATABASE_URL must be a PostgreSQL connection URL.')
    if parse_qs(parsed.query).get('sslmode') not in (['require'],['verify-ca'],['verify-full']):
        raise RuntimeError('Production DATABASE_URL must explicitly require TLS.')
    configured=environment.get('SDSS_ALLOWED_ORIGINS','')
    values=configured.split(',')
    if not configured or any(urlsplit(value).scheme!='https' or not urlsplit(value).hostname
        or urlsplit(value).path or urlsplit(value).query or urlsplit(value).fragment
        or urlsplit(value).username or urlsplit(value).password for value in values):
        raise RuntimeError('Production requires exact HTTPS SDSS_ALLOWED_ORIGINS without paths.')
