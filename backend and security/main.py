import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Ensure intra-package imports resolve cleanly
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from database import engine, Base
import models  # Register models with Base metadata
from auth_routes import router as auth_router
from pin_routes import router as pin_router
from routes import router as reviews_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="BrandLens AI Backend",
    version="1.0.0",
    description="Explainable pre-publication brand governance platform backend API.",
    lifespan=lifespan,
)

# Step 3: Enable CORS for Next.js frontend (port 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Modular Routers
app.include_router(auth_router)
app.include_router(pin_router)
app.include_router(reviews_router)


@app.get("/health", tags=["System"])
def health_check():
    """System health check endpoint."""
    return {"status": "healthy", "service": "brandlens-backend"}
