"""Download version-pinned, public inference assets at development time only.

No image or audio is read or uploaded by this script. Run with --ios on the Mac
used to build iOS; the default prepares the shared Face Landmarker model only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import os
import stat
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "modules" / "swallow-vision"
FACE = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
OPENCV = "https://github.com/opencv/opencv/releases/download/4.13.0/opencv-4.13.0-ios-framework.zip"


def download(url: str, path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        partial = path.with_suffix(path.suffix + ".partial")
        try:
            with urllib.request.urlopen(url, timeout=120) as source, partial.open("wb") as output:
                shutil.copyfileobj(source, output)
            partial.replace(path)
        finally:
            partial.unlink(missing_ok=True)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ios", action="store_true")
    args = parser.parse_args()
    cache = ROOT / ".vision-cache"
    task = cache / "face_landmarker.task"
    digest = download(FACE, task)
    # Pin the published model bytes, not just the URL, across repeat builds.
    expected = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
    if digest != expected:
        raise RuntimeError(f"Unexpected Face Landmarker SHA256: {digest}")
    for target in (MODULE / "android/src/main/assets/face_landmarker.task", MODULE / "ios/Resources/face_landmarker.task"):
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(task, target)
    manifest = {"face_landmarker": {"url": FACE, "sha256": digest}}
    if args.ios or os.environ.get("EAS_BUILD_PLATFORM") == "ios":
        archive = cache / "opencv-4.13.0-ios-framework.zip"
        cv_hash = download(OPENCV, archive)
        if cv_hash != "7ac1a77d21aa9556422e08d8b7ffcc30dfa9ebc0351a0ff32216395e8b14bede":
            raise RuntimeError(f"Unexpected OpenCV SHA256: {cv_hash}")
        target = MODULE / "ios/Frameworks"
        target.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive) as bundle:
            names = bundle.namelist()
            marker = "opencv2.xcframework/" if any("opencv2.xcframework/" in name for name in names) else "opencv2.framework/"
            links = []
            for member in bundle.infolist():
                if marker not in member.filename or member.is_dir():
                    continue
                relative = marker + member.filename.split(marker, 1)[1]
                destination = (target / relative).resolve()
                if not destination.is_relative_to(target.resolve()):
                    raise RuntimeError("Unsafe archive path")
                destination.parent.mkdir(parents=True, exist_ok=True)
                if stat.S_ISLNK(member.external_attr >> 16):
                    link = bundle.read(member).decode("utf-8")
                    resolved = (destination.parent / link).resolve()
                    if not resolved.is_relative_to(target.resolve()):
                        raise RuntimeError("Unsafe framework symlink")
                    links.append((destination, link))
                    continue
                with bundle.open(member) as source, destination.open("wb") as output:
                    shutil.copyfileobj(source, output)
            # Framework ZIPs contain version/headers/binary symlinks. Preserve
            # these on macOS; materialize them on Windows without admin rights.
            for destination, link in sorted(links, key=lambda item: len(item[0].parts), reverse=True):
                if destination.is_symlink():
                    destination.unlink()
                elif destination.is_file():
                    destination.unlink()
                elif destination.is_dir():
                    continue
                source = (destination.parent / link).resolve()
                if os.name != "nt":
                    destination.symlink_to(link, target_is_directory=source.is_dir())
                elif source.is_dir():
                    shutil.copytree(source, destination)
                else:
                    shutil.copy2(source, destination)
            if not (target / marker.rstrip("/")).exists():
                raise RuntimeError("OpenCV framework not found in release")
        manifest["opencv_ios"] = {"url": OPENCV, "sha256": cv_hash, "framework": marker.rstrip("/")}
    (cache / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
