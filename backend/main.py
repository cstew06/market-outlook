from fastapi import FastAPI

app = FastAPI(title="Market Outlook API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
