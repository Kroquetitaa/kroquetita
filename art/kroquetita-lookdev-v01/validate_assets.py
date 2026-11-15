"""Validate the pilot GLBs and repair the known Blender NLA rest-pose export.

Standard library only. Run directly, or call ``finalize_exports(folder)`` after
exporting. A repair changes the JSON chunk only; binary/unknown chunks retain
their original bytes. Unexpected transforms or missing nodes are errors.
"""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path


JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
EXPECTED_ROOTS = {
    "avatar": "AvatarRoot",
    "coffee_machine": "CoffeeRoot",
    "plaza_module": "GroundRoot",
}
BODY_REST = [0.0, 0.34, 0.0]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def close(actual, expected):
    return (
        isinstance(actual, (list, tuple))
        and len(actual) == len(expected)
        and all(isinstance(a, (int, float)) and math.isfinite(a)
                and abs(a - b) <= 1e-6 for a, b in zip(actual, expected))
    )


def read_glb(path):
    raw = path.read_bytes()
    require(len(raw) >= 20, f"{path.name}: truncated GLB")
    magic, version, size = struct.unpack_from("<4sII", raw)
    require(magic == b"glTF" and version == 2, f"{path.name}: expected GLB version 2")
    require(size == len(raw), f"{path.name}: header length mismatch")
    chunks = []
    offset = 12
    while offset < size:
        require(offset + 8 <= size, f"{path.name}: truncated chunk header")
        length, kind = struct.unpack_from("<II", raw, offset)
        end = offset + 8 + length
        require(length % 4 == 0 and end <= size, f"{path.name}: invalid chunk length")
        chunks.append((kind, raw[offset + 8:end]))
        offset = end
    require(chunks and chunks[0][0] == JSON_CHUNK, f"{path.name}: first chunk must be JSON")
    require(sum(kind == JSON_CHUNK for kind, _ in chunks) == 1,
            f"{path.name}: duplicate JSON chunks")
    document = json.loads(chunks[0][1].decode("utf-8"))
    require(document.get("asset", {}).get("version") == "2.0", f"{path.name}: invalid glTF asset version")
    return raw, document, chunks


def encode_glb(document, chunks):
    payload = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    payload += b" " * (-len(payload) % 4)
    encoded = struct.pack("<II", len(payload), JSON_CHUNK) + payload
    # Do not decode, repack, or alter BIN or any unknown extension chunks.
    for kind, payload in chunks[1:]:
        encoded += struct.pack("<II", len(payload), kind) + payload
    return struct.pack("<4sII", b"glTF", 2, 12 + len(encoded)) + encoded


def accessor_values(document, chunks, index):
    accessor = document["accessors"][index]
    require(accessor.get("componentType") == 5126 and "sparse" not in accessor,
            "Expected a nonsparse float animation accessor")
    dimension = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}.get(accessor["type"])
    require(dimension is not None, "Unexpected animation accessor type")
    view = document["bufferViews"][accessor["bufferView"]]
    require(view.get("buffer", 0) == 0, "Unexpected animation buffer")
    binary = [payload for kind, payload in chunks if kind == BIN_CHUNK]
    require(len(binary) == 1, "Expected exactly one embedded binary chunk")
    size = dimension * 4
    stride = view.get("byteStride", size)
    require(stride >= size and stride % 4 == 0, "Invalid animation stride")
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    count = accessor["count"]
    limit = offset + (count - 1) * stride + size
    require(count > 0 and limit <= len(binary[0])
            and limit <= view.get("byteOffset", 0) + view["byteLength"],
            "Animation accessor exceeds buffer bounds")
    return [struct.unpack_from("<" + "f" * dimension, binary[0], offset + i * stride)
            for i in range(count)]


def multiply(a, b):
    return [sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
            for col in range(4) for row in range(4)]


def transform(node):
    if "matrix" in node:
        return node["matrix"]
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    tx, ty, tz = node.get("translation", [0, 0, 0])
    return [
        (1 - 2*y*y - 2*z*z)*sx, (2*x*y + 2*z*w)*sx, (2*x*z - 2*y*w)*sx, 0,
        (2*x*y - 2*z*w)*sy, (1 - 2*x*x - 2*z*z)*sy, (2*y*z + 2*x*w)*sy, 0,
        (2*x*z + 2*y*w)*sz, (2*y*z - 2*x*w)*sz, (1 - 2*x*x - 2*y*y)*sz, 0,
        tx, ty, tz, 1,
    ]


def bounds_and_counts(document, root_index):
    nodes = document["nodes"]
    accessors = document["accessors"]
    low, high = [math.inf]*3, [-math.inf]*3
    triangles, mesh_nodes = 0, 0
    visited = set()

    def visit(index, parent):
        nonlocal triangles, mesh_nodes
        require(index not in visited, "Repeated node or cycle in asset hierarchy")
        visited.add(index)
        node = nodes[index]
        matrix = multiply(parent, transform(node))
        if "mesh" in node:
            mesh_nodes += 1
            for primitive in document["meshes"][node["mesh"]]["primitives"]:
                positions = accessors[primitive["attributes"]["POSITION"]]
                require("min" in positions and "max" in positions, "Position bounds missing")
                count = accessors[primitive["indices"]]["count"] if "indices" in primitive else positions["count"]
                mode = primitive.get("mode", 4)
                triangles += count // 3 if mode == 4 else max(0, count - 2) if mode in (5, 6) else 0
                for corner in range(8):
                    point = [positions["max" if corner & (1 << k) else "min"][k] for k in range(3)]
                    world = [sum(matrix[k*4+r] * point[k] for k in range(3)) + matrix[12+r]
                             for r in range(3)]
                    for k in range(3):
                        low[k] = min(low[k], world[k])
                        high[k] = max(high[k], world[k])
        for child in node.get("children", []):
            visit(child, matrix)

    visit(root_index, IDENTITY)
    require(mesh_nodes > 0 and all(math.isfinite(x) for x in low + high), "No finite mesh bounds")
    return {
        "mesh_objects": mesh_nodes,
        "triangles": triangles,
        "bounds_min": [round(v, 6) for v in low],
        "bounds_max": [round(v, 6) for v in high],
        "dimensions": [round(high[k] - low[k], 6) for k in range(3)],
        "bounds_method": "transformed local accessor AABBs in the default pose",
    }


def validate_asset(name, document, chunks):
    nodes = document.get("nodes", [])
    scenes = document.get("scenes", [])
    require(len(scenes) == 1, f"{name}: expected one scene")
    roots = scenes[document.get("scene", 0)].get("nodes", [])
    require(len(roots) == 1, f"{name}: expected one root")
    root_index = roots[0]
    root = nodes[root_index]
    require(root.get("name") == EXPECTED_ROOTS[name], f"{name}: unexpected root name")
    require(close(transform(root), IDENTITY), f"{name}: root must have identity transform")
    require(not document.get("cameras") and all("camera" not in n for n in nodes),
            f"{name}: cameras must be excluded")
    require("KHR_lights_punctual" not in document.get("extensions", {})
            and all("KHR_lights_punctual" not in n.get("extensions", {}) for n in nodes),
            f"{name}: lights must be excluded")
    require(all("uri" not in b for b in document.get("buffers", [])), f"{name}: external buffer")
    require(all(not image.get("uri") or image["uri"].startswith("data:")
                for image in document.get("images", [])), f"{name}: external image")
    animations = document.get("animations", [])
    for animation in animations:
        require(all(c["target"].get("node") != root_index for c in animation["channels"]),
                f"{name}: root animation is not permitted")

    repaired = False
    if name == "avatar":
        bodies = [i for i, node in enumerate(nodes) if node.get("name") == "Body"]
        require(len(bodies) == 1, "avatar: expected exactly one Body node")
        body_index = bodies[0]
        body = nodes[body_index]
        require("matrix" not in body, "avatar: unexpected Body matrix")
        require(close(body.get("rotation", [0, 0, 0, 1]), [0, 0, 0, 1])
                and close(body.get("scale", [1, 1, 1]), [1, 1, 1]),
                "avatar: unexpected Body rotation or scale")
        require(len(animations) == 1 and animations[0].get("name") == "Idle",
                "avatar: expected exactly one Idle animation")
        idle = animations[0]
        translations = [c for c in idle["channels"] if c["target"].get("node") == body_index
                        and c["target"].get("path") == "translation"]
        require(len(translations) == 1, "avatar: missing or duplicate Body translation animation")
        sampler = idle["samplers"][translations[0]["sampler"]]
        values = accessor_values(document, chunks, sampler["output"])
        require(close(values[0], BODY_REST) and close(values[-1], BODY_REST),
                "avatar: Idle endpoints do not match the known Body rest pose")
        if "translation" in body:
            require(close(body["translation"], BODY_REST), "avatar: unexpected Body translation")
        else:
            body["translation"] = BODY_REST.copy()
            repaired = True
    else:
        require(not animations, f"{name}: unexpected animation")

    summary = bounds_and_counts(document, root_index)
    summary.update({
        "root": root["name"], "root_identity": True, "cameras": 0, "lights": 0,
        "animations": [a.get("name") for a in animations], "root_motion": False,
        "materials": len(document.get("materials", [])),
        "default_body_translation": BODY_REST if name == "avatar" else None,
        "default_pose_repaired": repaired,
    })
    return summary, repaired


def finalize_exports(folder):
    """Validate all exports first, then repair the known pose and write QA data."""
    folder = Path(folder)
    manifest_path = folder / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    require(set(manifest.get("assets", {})) == set(EXPECTED_ROOTS), "Unexpected manifest assets")
    pending = []
    qa = {"version": 1, "status": "passed", "units": "metres", "up": "+Y",
          "forward": "+Z", "assets": {}}
    for name in EXPECTED_ROOTS:
        entry = manifest["assets"][name]
        require(entry.get("file") == name + ".glb", f"{name}: unexpected manifest filename")
        path = folder / entry["file"]
        original, document, chunks = read_glb(path)
        summary, repaired = validate_asset(name, document, chunks)
        output = encode_glb(document, chunks) if repaired else original
        summary.update({"file": path.name, "bytes": len(output), "glb_version": 2,
                        "header_length_valid": True, "binary_chunks_preserved": True})
        qa["assets"][name] = summary
        entry["bytes"] = len(output)
        pending.append((path, output, repaired))
    # No output is touched if validation of any of the three assets fails.
    for path, output, repaired in pending:
        if repaired:
            path.write_bytes(output)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (folder / "qa.json").write_text(json.dumps(qa, indent=2) + "\n", encoding="utf-8")
    return qa


if __name__ == "__main__":
    folder = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / "exports"
    print(json.dumps(finalize_exports(folder), indent=2))
