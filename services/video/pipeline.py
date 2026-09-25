"""Unconnected production CV pipeline. Run in a separate queue-backed GPU service."""
from dataclasses import dataclass
from typing import Protocol
STAGES = ['ingest','calibrate','detect_players_ball','track','cluster_teams','assign_identity','project_coordinates','compute_features','detect_events','generate_insights']
@dataclass
class Job:
    id: str
    organization_id: str
    match_id: str
    object_key: str
    model_version: str
class Stage(Protocol):
    async def run(self, job: Job, input_artifacts: dict) -> dict: ...
class UnconnectedStage:
    def __init__(self, name): self.name = name
    async def run(self, job, input_artifacts):
        raise NotImplementedError(f'{self.name}: connect a validated implementation')
pipeline = [UnconnectedStage(name) for name in STAGES]
async def process(job, checkpoint):
    artifacts = {}
    for stage in pipeline:
        artifacts = await stage.run(job, artifacts)
        await checkpoint(job, artifacts)
    return artifacts
