"""Privately verify and save Neon settings without displaying credentials."""
import json
import os
from pathlib import Path
import tkinter as tk
from tkinter import ttk

import configure_database  # Initializes the installed Windows PostgreSQL library.
import psycopg
from psycopg.conninfo import conninfo_to_dict


def parse_settings(value):
    urls = {}
    for line in value.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("postgresql://") or line.startswith("postgres://"):
            urls["DATABASE_URL"] = line
        elif "=" in line:
            key, url = line.split("=", 1)
            if key.strip() in ("DATABASE_URL", "DATABASE_URL_POOLED"):
                urls[key.strip()] = url.strip().strip("\"'")
    url = urls.get("DATABASE_URL") or urls.get("DATABASE_URL_POOLED")
    if not url:
        raise ValueError("Copy the connection strings from Neon and paste them here.")
    config = conninfo_to_dict(url)
    if not config.get("host", "").endswith(".neon.tech"):
        raise ValueError("Please use the connection details supplied by Neon.")
    if not config.get("password") or "*" in config["password"]:
        raise ValueError("The password is missing or masked. Use Neon's Copy connection strings button.")
    config["sslmode"] = "require"
    return config


def main():
    window = tk.Tk()
    window.title("SDSS — Connect Neon cloud database")
    window.geometry("620x350")
    panel = ttk.Frame(window, padding=24)
    panel.pack(fill="both", expand=True)
    ttk.Label(panel, text="Connect your Neon database", font=("Segoe UI", 14, "bold")).pack(anchor="w")
    ttk.Label(panel, text="Paste the copied connection strings below. Your details stay hidden.", wraplength=560).pack(anchor="w", pady=14)
    entry = ttk.Entry(panel, show="*", width=65)
    entry.pack(fill="x", pady=8)
    # Preserve multiline environment text when pasted into a single-line secret field.
    def paste(event=None):
        try:
            value = window.clipboard_get()
            entry.delete(0, "end")
            entry.insert(0, value)
        except tk.TclError:
            pass
        return "break"
    entry.bind("<<Paste>>", paste)
    status = tk.StringVar(value="Click Connect and save after pasting.")
    ttk.Label(panel, textvariable=status, wraplength=560).pack(anchor="w", pady=12)

    def submit():
        button.configure(state="disabled")
        status.set("Checking the cloud connection…")
        window.update_idletasks()
        try:
            config = parse_settings(entry.get())
            with psycopg.connect(**config, connect_timeout=15) as connection:
                connection.execute("SELECT 1").fetchone()
            target = Path(__file__).with_name("database.local.json")
            temporary = target.with_suffix(".tmp")
            try:
                temporary.write_text(json.dumps(config), encoding="utf-8")
                os.replace(temporary, target)
            finally:
                temporary.unlink(missing_ok=True)
            entry.delete(0, "end")
            status.set("SUCCESS — Neon connection verified and settings saved. You may close this window.")
        except ValueError as error:
            status.set(str(error))
        except psycopg.Error:
            status.set("Connection failed. Copy the Neon details again and check your internet connection. Existing settings were kept.")
        except OSError:
            status.set("Unable to save settings. Existing settings were kept.")
        finally:
            button.configure(state="normal")

    button = ttk.Button(panel, text="Connect and save", command=submit)
    button.pack(anchor="w", pady=8)
    ttk.Label(panel, text="Saved privately on this computer in a file excluded from GitHub. No project data is changed.", wraplength=560).pack(anchor="w", pady=12)
    entry.focus_set()
    window.mainloop()


if __name__ == "__main__":
    main()
