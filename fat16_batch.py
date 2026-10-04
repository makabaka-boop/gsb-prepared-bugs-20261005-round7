"""A single sector journal for a bounded manifest of file replacements."""

import argparse
import json
import os
from pathlib import Path
import fat16_replace as fat


class Overlay:
    def __init__(self, source):
        self.source = source
        self.size = source.size
        self.sectors = {}

    def read_sector(self, sector):
        return self.sectors.get(sector, self.source.read_sector(sector))

    def read(self, offset, length):
        if offset < 0 or length < 0 or offset + length > self.size:
            raise fat.FatError("Read outside image")
        result = bytearray()
        while length:
            sector, within = divmod(offset, fat.SECTOR_SIZE)
            amount = min(length, fat.SECTOR_SIZE - within)
            result.extend(self.read_sector(sector)[within : within + amount])
            offset += amount
            length -= amount
        return bytes(result)


def build_batch(image, replacements):
    if not isinstance(replacements, list) or not 1 <= len(replacements) <= 8:
        raise fat.FatError("Expected 1..8 replacements")
    layout, fat0, _ = fat.parse_and_validate_layout(image)
    targets = []
    identities = set()
    for path, content in replacements:
        if not isinstance(content, bytes):
            raise fat.FatError("Content must be bytes")
        target = fat.find_file_and_validate_chains(
            image, layout, fat0, fat.normalize_fat_path(path)
        )
        identity = (target.sector, target.offset)
        if identity in identities:
            raise fat.FatError("Duplicate target entry")
        identities.add(identity)
        targets.append((target, content))
    overlay = Overlay(image)
    merged = {}
    reports = []
    for target, content in targets:
        current_fat = fat0
        current = target
        plan = fat.build_replacement_plan(image, layout, current_fat, current, content)
        for change in plan.changes:
            overlay.sectors[change.sector] = change.new
            merged[change.sector] = fat.SectorChange(
                change.sector, image.read_sector(change.sector), change.new, change.kind
            )
        reports.append(fat.plan_result(plan, 0, False))
    changes = tuple(merged[k] for k in sorted(merged) if merged[k].old != merged[k].new)
    plan = fat.ReplacementPlan(
        "@batch",
        sum(t.size for t, _ in targets),
        sum(len(c) for _, c in targets),
        (),
        (),
        changes,
    )
    return plan, reports


def replace_batch(path, replacements):
    if os.path.exists(str(path) + ".journal"):
        raise fat.FatError("Recover existing journal before a new batch")
    results = []
    for replacement in replacements:
        with fat.ImageReader(str(path)) as image:
            plan, reports = build_batch(image, [replacement])
        results.append(fat.execute_plan(str(path), plan))
    return {"files": results}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("image")
    parser.add_argument("manifest")
    args = parser.parse_args()
    rows = json.loads(Path(args.manifest).read_text())
    replacements = [(row["path"], Path(row["input"]).read_bytes()) for row in rows]
    try:
        print(json.dumps(replace_batch(args.image, replacements)))
    except fat.FatError as e:
        parser.exit(2, str(e) + "\n")


if __name__ == "__main__":
    main()
