from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, CheckConstraint, DateTime, Numeric, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Holding(Base):
    __tablename__ = "holdings"
    workspace: Mapped[str] = mapped_column(String(16), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(28, 10))
    average_cost: Mapped[Decimal] = mapped_column(Numeric(28, 10))
    __table_args__ = (
        CheckConstraint("quantity > 0"),
        CheckConstraint("average_cost >= 0"),
    )


class WatchItem(Base):
    __tablename__ = "watch_items"
    workspace: Mapped[str] = mapped_column(String(16), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(24), primary_key=True)


class Workspace(Base):
    __tablename__ = "workspaces"
    name: Mapped[str] = mapped_column(String(16), primary_key=True)


class OutlookRecord(Base):
    __tablename__ = "outlooks"
    workspace: Mapped[str] = mapped_column(String(16), primary_key=True)
    asset_id: Mapped[str] = mapped_column(String(24), primary_key=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    payload: Mapped[dict] = mapped_column(JSON)


def get_db():
    with SessionLocal() as session:
        yield session
