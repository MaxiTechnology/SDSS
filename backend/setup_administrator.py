"""Local-only first-account setup. Secrets are entered in a masked desktop form."""
import tkinter as tk
from tkinter import ttk
import threading
import auth


def main():
    root=tk.Tk();root.title('SSDSS — Create administrator');root.geometry('640x480')
    frame=ttk.Frame(root,padding=24);frame.pack(fill='both',expand=True)
    ttk.Label(frame,text='Create the first SSDSS administrator',font=('Segoe UI',14,'bold')).pack(anchor='w')
    ttk.Label(frame,text='Enter these details privately. Do not send your password in chat.').pack(anchor='w',pady=(10,12))
    values=[]
    for label,hidden in [('Username',False),('Display name',False),('Password (15–128 characters)',True),('Confirm password',True)]:
        ttk.Label(frame,text=label).pack(anchor='w',pady=(6,0));entry=ttk.Entry(frame,show='*' if hidden else '');entry.pack(fill='x');values.append(entry)
    message=tk.StringVar();ttk.Label(frame,textvariable=message,wraplength=580).pack(anchor='w',pady=12)
    def complete(text,success):
        message.set(text);button.config(state='normal')
        if success:
            values[2].delete(0,'end');values[3].delete(0,'end')
            button.config(state='disabled')
    def save():
        name,display,password,confirm=(entry.get() for entry in values)
        if password!=confirm:message.set('The passwords do not match.');return
        button.config(state='disabled');message.set('Creating your account…')
        def worker():
            try:
                auth.bootstrap_administrator(name,display,password)
                text='Administrator created. Close this window, return to SSDSS and check account setup, then sign in.';success=True
            except ValueError as error:text=str(error);success=False
            except Exception:text='Account setup failed. Check that database migrations have been applied and your private connection is available.';success=False
            try:root.after(0,complete,text,success)
            except RuntimeError:pass
        threading.Thread(target=worker,daemon=True).start()
    button=ttk.Button(frame,text='Create Administrator',command=save);button.pack(anchor='w')
    values[0].focus();root.mainloop()


if __name__=='__main__':main()
