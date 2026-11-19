"""Private terminal setup for a separate deployment database. Never a web route."""
import getpass
import os
import database


def main():
    print('SSDSS deployment setup: use the separate deployment database, not the demo database.')
    connection=getpass.getpass('Deployment DATABASE_URL (hidden): ').strip()
    if not connection:
        print('No database URL supplied. Nothing changed.');return 1
    previous=os.environ.get('DATABASE_URL')
    os.environ['DATABASE_URL']=connection
    try:
        from deployment_config import validate_environment
        validate_environment({'DATABASE_URL':connection,'SDSS_ALLOWED_ORIGINS':'https://setup.invalid'})
        with database.connect() as c:
            # This tool is for a new environment only. Existing-account databases
            # must use the normal reviewed migration process instead.
            exists=c.execute("SELECT to_regclass('auth_users') AS name").fetchone()['name']
            if exists and c.execute('SELECT 1 FROM auth_users LIMIT 1').fetchone():
                print('Accounts already exist. Setup stopped without changing this database.');return 1
        name=input('First administrator username: ').strip()
        display=input('First administrator display name: ').strip()
        password=getpass.getpass('First administrator password (15–128 characters): ')
        confirmation=getpass.getpass('Confirm password: ')
        if password!=confirmation:
            print('Passwords do not match. Nothing changed.');return 1
        import auth
        auth.username(name);auth.password(password)
        if not 1<=len(display)<=100:raise ValueError()
        with database.connect() as c:database.migrate(c)
        auth.bootstrap_administrator(name,display,password)
        print('Deployment database prepared and first administrator created. Secrets were not saved to a file.')
        return 0
    except (database.psycopg.Error,OSError,ValueError,RuntimeError):
        print('Setup failed. Check the private database connection and account fields. Credentials were not printed.')
        return 1
    finally:
        if previous is None:os.environ.pop('DATABASE_URL',None)
        else:os.environ['DATABASE_URL']=previous


if __name__=='__main__':raise SystemExit(main())
