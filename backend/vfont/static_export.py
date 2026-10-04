"""Serialize the engine's rounded coordinates as one static SFNT instance."""

import hashlib
import math
import struct
from .binary import read_sfnt_tables, VariationEngineError


def checksum(data):
    data = data + b"\0" * ((-len(data)) % 4)
    return sum(struct.unpack(">" + str(len(data) // 4) + "I", data)) & 0xFFFFFFFF


def short(value):
    if not -32768 <= value <= 32767:
        raise VariationEngineError("Static coordinate/metric not representable")
    return int(value)


def glyph_bytes(glyph, points):
    coords = [p["final"] for p in points if not p["phantom"]]
    if not coords:
        return b"", (0, 0, 0, 0)
    xs = [short(x) for x, y in coords]
    ys = [short(y) for x, y in coords]
    bounds = (min(xs), min(ys), max(xs), max(ys))
    body = struct.pack(">hhhhh", len(glyph.end_pts), *bounds)
    body += struct.pack(">" + str(len(glyph.end_pts)) + "H", *glyph.end_pts) + b"\0\0"
    body += bytes(1 if on else 0 for on in glyph.on_curve)
    for axis in [xs, ys]:
        last = 0
        for value in axis:
            body += struct.pack(">h", short(value - last))
            last = value
    return body + b"\0" * (len(body) % 2), bounds


def assemble(tables):
    tags = sorted(tables)
    count = len(tags)
    power = 1 << (count.bit_length() - 1)
    header = struct.pack(
        ">IHHHH",
        0x10000,
        count,
        16 * power,
        power.bit_length() - 1,
        count * 16 - 16 * power,
    )
    offset = 12 + 16 * count
    directory = []
    payload = []
    head_offset = None
    for tag in tags:
        data = tables[tag]
        directory.append(
            struct.pack(
                ">4sIII", tag.encode("ascii"), checksum(data), offset, len(data)
            )
        )
        if tag == "head":
            head_offset = offset
        padded = data + b"\0" * ((-len(data)) % 4)
        payload.append(padded)
        offset += len(padded)
    result = bytearray(header + b"".join(directory) + b"".join(payload))
    if head_offset is None:
        raise VariationEngineError("Missing head")
    struct.pack_into(
        ">I", result, head_offset + 8, (0xB1B0AFBA - checksum(result)) & 0xFFFFFFFF
    )
    return bytes(result)


def export_static(engine, location, expected_digest):
    digest = hashlib.sha256(engine.blob).hexdigest()
    if expected_digest is None:
        raise VariationEngineError("Font digest required")
    tags = {a.tag for a in engine.axes}
    if (
        not isinstance(location, dict)
        or set(location) - tags
        or any(
            type(v) not in (int, float) or not math.isfinite(v)
            for v in location.values()
        )
    ):
        raise VariationEngineError("Invalid export location")
    tables = dict(read_sfnt_tables(engine.blob))
    glyf = bytearray()
    offsets = [0]
    metrics = []
    all_bounds = []
    max_points = max_contours = 0
    for gid, glyph in enumerate(engine.static.glyphs):
        report = engine.instance(dict(location), gid)
        body, bounds = glyph_bytes(glyph, report["points"])
        glyf.extend(body)
        offsets.append(len(glyf))
        all_bounds.append(bounds)
        outline = report["outlinePointCount"]
        left = report["points"][outline]["final"][0]
        right = report["points"][outline + 1]["final"][0]
        advance = right - left
        if not 0 <= advance <= 65535:
            raise VariationEngineError("Advance not representable")
        lsb = short(bounds[0] - left)
        metrics.append((advance, lsb, bounds[2] - bounds[0]))
        max_points = max(max_points, outline)
        max_contours = max(max_contours, len(glyph.end_pts))
    tables["glyf"] = bytes(glyf)
    tables["loca"] = struct.pack(">" + str(len(offsets)) + "I", *offsets)
    head = bytearray(tables["head"])
    head[8:12] = b"\0" * 4
    struct.pack_into(">h", head, 50, 1)
    tables["head"] = bytes(head)
    return assemble(tables)
