from fastapi import FastAPI

app = FastAPI(title="SDSS API")


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "SDSS API"}
