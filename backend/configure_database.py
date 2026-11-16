"""Interactive local setup. Never prints or logs the database password."""
import tkinter as tk
from tkinter import ttk, messagebox
import json
import os
from pathlib import Path

# Use the user's installed PostgreSQL client library on Windows.
postgres_bin = Path("C:/Program Files/PostgreSQL/18/bin")
if os.name == "nt" and postgres_bin.exists():
    os.environ["PATH"] = str(postgres_bin) + os.pathsep + os.environ.get("PATH", "")
    os.environ["PSYCOPG_IMPL"] = "python"
    dll_directory = os.add_dll_directory(str(postgres_bin))
import psycopg


def connect_and_save(password):
    print("SDSS — local database setup")
    print("Database: sdss_dev | User: sdss_app | Address: localhost:5432")
    print("Your password is hidden while typing. Press Enter when finished.")
    print("After a successful check, settings are saved in database.local.json")
    print("on this computer. This file contains your password; do not share it.")
    if not password:
        print("No password entered. Nothing was saved.")
        return False
    config = {"host": "localhost", "port": 5432, "dbname": "sdss_dev", "user": "sdss_app", "password": password}
    try:
        with psycopg.connect(**config, connect_timeout=5) as connection:
            database, user = connection.execute("SELECT current_database(), current_user").fetchone()
            if database != "sdss_dev" or user != "sdss_app":
                print("Unexpected database or user. Nothing was saved.")
                return False
    except psycopg.OperationalError:
        print("Connection failed. Check that PostgreSQL is running and the sdss_app password is correct.")
        print("Nothing was saved. Run this setup again to retry.")
        return False
    target = Path(__file__).with_name("database.local.json")
    temporary = target.with_suffix(".tmp")
    try:
        temporary.write_text(json.dumps(config), encoding="utf-8")
        os.replace(temporary, target)
    finally:
        if temporary.exists():
            temporary.unlink()
    print("SUCCESS — database connection verified and local settings saved.")
    print("No project records have been created or changed.")
    return True


def main():
    window = tk.Tk()
    window.title("SDSS — Database setup")
    window.geometry("540x320")
    panel = ttk.Frame(window, padding=24)
    panel.pack(fill="both", expand=True)
    ttk.Label(panel, text="Connect your SDSS database", font=("Segoe UI", 14, "bold")).pack(anchor="w")
    ttk.Label(panel, text="Database: sdss_dev | User: sdss_app | Port: 5432").pack(anchor="w", pady=14)
    ttk.Label(panel, text="Password for sdss_app").pack(anchor="w")
    entry = ttk.Entry(panel, show="*", width=45)
    entry.pack(fill="x", pady=8)
    entry.focus_set()
    status = tk.StringVar(value="Type or paste your password. Stars appear as you type.")
    ttk.Label(panel, textvariable=status, wraplength=480).pack(anchor="w", pady=8)

    def submit(event=None):
        button.configure(state="disabled")
        status.set("Checking connection…")
        window.update_idletasks()
        try:
            success = connect_and_save(entry.get())
            if success:
                entry.delete(0, "end")
                status.set("SUCCESS — connection verified and settings saved. You may close this window.")
            else:
                status.set("Connection failed. Check the sdss_app password and try again. This window will stay open.")
        except OSError:
            status.set("Unable to save settings. Please tell me this message.")
        finally:
            button.configure(state="normal")

    button = ttk.Button(panel, text="Connect and save", command=submit)
    button.pack(anchor="w", pady=8)
    window.bind("<Return>", submit)
    ttk.Label(panel, text="Settings are saved locally and contain your password. Do not share the settings file.", wraplength=480).pack(anchor="w", pady=8)
    window.mainloop()


if __name__ == "__main__":
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print("\nSetup cancelled.")
