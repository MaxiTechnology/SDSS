"""Private desktop connection dialog; no credentials are printed or logged."""
import queue
import threading
import tkinter as tk
from tkinter import ttk
from cloudflare_ai import AIConnectionError,verify_and_save


def main():
    window=tk.Tk();window.title('SDSS - Connect AI service');window.geometry('660x450')
    panel=ttk.Frame(window,padding=24);panel.pack(fill='both',expand=True)
    ttk.Label(panel,text='Connect Cloudflare Workers AI',font=('Segoe UI',14,'bold')).pack(anchor='w')
    ttk.Label(panel,text='Copy the Account ID and API token from Cloudflare into this window.\nKeep this window private while entering your details.',wraplength=600).pack(anchor='w',pady=14)
    ttk.Label(panel,text='Cloudflare Account ID').pack(anchor='w')
    account=ttk.Entry(panel,width=65);account.pack(fill='x',pady=(4,12))
    ttk.Label(panel,text='Workers AI API token (hidden)').pack(anchor='w')
    token=ttk.Entry(panel,show='*',width=65);token.pack(fill='x',pady=(4,12))
    status=tk.StringVar(value='Connect and save runs one short AI test using your free allowance.')
    ttk.Label(panel,textvariable=status,wraplength=600).pack(anchor='w',pady=12)
    outcomes=queue.Queue()
    def check(values):
        try:verify_and_save(*values);outcomes.put('SUCCESS - AI connection verified and settings saved. You may close this window.')
        except AIConnectionError as error:outcomes.put(str(error))
        except OSError:outcomes.put('Could not save the settings. Existing settings were kept.')
        except Exception:outcomes.put('The connection check could not finish. Please retry. Existing settings were kept.')
    def poll():
        try:message=outcomes.get_nowait()
        except queue.Empty:window.after(100,poll);return
        status.set(message);button.configure(state='normal');account.configure(state='normal');token.configure(state='normal')
        if message.startswith('SUCCESS'):token.delete(0,'end')
    def submit():
        values=(account.get(),token.get());button.configure(state='disabled');account.configure(state='disabled');token.configure(state='disabled')
        status.set('Checking the AI connection...');threading.Thread(target=check,args=(values,),daemon=True).start();window.after(100,poll)
    button=ttk.Button(panel,text='Connect and save',command=submit);button.pack(anchor='w',pady=8)
    ttk.Label(panel,text='Credentials are saved locally in backend/ai.local.json, excluded from GitHub.\nThis check sends only a short test message; it does not change project data.',wraplength=600).pack(anchor='w',pady=12)
    account.focus_set();window.mainloop()


if __name__=='__main__':main()
