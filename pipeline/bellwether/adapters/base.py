"""Adapter interfaces. Each source implements one of these; the pipeline only
talks to the interfaces, so a paid source (AP, DDHQ) can replace a free one by
configuration without touching the model."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterable

from ..schema import Poll, Race


class RaceSource(ABC):
    name: str

    @abstractmethod
    def races(self) -> list[Race]: ...


class PollSource(ABC):
    name: str

    @abstractmethod
    def polls(self) -> Iterable[Poll]: ...


class MarketSource(ABC):
    name: str

    @abstractmethod
    def markets(self) -> list[dict]: ...


class ResultsSource(ABC):
    """Live election-night results. Implementations: state SOS scrapers (free),
    AP Elections API and Decision Desk HQ (paid, stubs until keys exist)."""
    name: str

    @abstractmethod
    def fetch(self) -> dict: ...
