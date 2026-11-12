"""Download version-pinned, public inference assets at development time only.

No image or audio is read or uploaded by this script. Run with --ios on the Mac
used to build iOS; the default prepares the shared Face Landmarker model only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import ssl
import tarfile
import urllib.request
from pathlib import Path


def _ssl_context() -> ssl.SSLContext | None:
    """Use certifi when the Python.org install has no default CA bundle."""
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return None

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "modules" / "swallow-vision"
FACE = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
# MediaPipeTasksCommon 0.10.21 embeds OpenCV 4.5.3. Headers must match that ABI;
# linking a second opencv2.framework duplicates ObjC (Mat, Point, …).
OPENCV = "https://github.com/opencv/opencv/archive/refs/tags/4.5.3.tar.gz"
OPENCV_SHA256 = "77f616ae4bea416674d8c373984b20c8bd55e7db887fd38c6df73463a0647bab"
FACE_SHA256 = "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"


def download(url: str, path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        partial = path.with_suffix(path.suffix + ".partial")
        try:
            with urllib.request.urlopen(url, timeout=120, context=_ssl_context()) as source, partial.open("wb") as output:
                shutil.copyfileobj(source, output)
            partial.replace(path)
        finally:
            partial.unlink(missing_ok=True)
    return hashlib.sha256(path.read_bytes()).hexdigest()


def install_opencv_headers(archive: Path, framework: Path) -> None:
    """Headers-only opencv2.framework matching MediaPipe's OpenCV 4.5.3."""
    if framework.exists():
        shutil.rmtree(framework)
    headers = framework / "Headers"
    headers.mkdir(parents=True)
    prefix = "opencv-4.5.3/modules/"
    include_marker = "/include/opencv2/"
    with tarfile.open(archive, "r:gz") as bundle:
        for member in bundle.getmembers():
            if not member.isfile() or not member.name.startswith(prefix):
                continue
            marker_at = member.name.find(include_marker)
            if marker_at < 0:
                continue
            relative = Path("opencv2") / member.name[marker_at + len(include_marker) :]
            if ".." in relative.parts:
                raise RuntimeError("Unsafe archive path")
            nested = headers / relative
            nested.parent.mkdir(parents=True, exist_ok=True)
            extracted = bundle.extractfile(member)
            if extracted is None:
                continue
            with extracted, nested.open("wb") as output:
                shutil.copyfileobj(extracted, output)
            # Framework-style includes: <opencv2/core.hpp> → Headers/core.hpp
            flattened = headers / Path(*relative.parts[1:])
            if flattened != nested:
                flattened.parent.mkdir(parents=True, exist_ok=True)
                if not flattened.exists():
                    shutil.copy2(nested, flattened)
    modules = sorted(
        path.stem.upper()
        for path in (headers / "opencv2").glob("*.hpp")
        if path.stem not in {"opencv", "opencv_modules"}
    )
    module_header = headers / "opencv2" / "opencv_modules.hpp"
    module_header.write_text(
        "#ifndef OPENCV_MODULES_HPP\n#define OPENCV_MODULES_HPP\n"
        + "".join(f"#define HAVE_OPENCV_{name}\n" for name in modules)
        + "#endif\n",
        encoding="utf-8",
    )
    shutil.copy2(module_header, headers / "opencv_modules.hpp")
    if not (headers / "imgproc.hpp").exists() or not (headers / "imgcodecs/ios.h").exists():
        raise RuntimeError("OpenCV 4.5.3 headers were not extracted")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ios", action="store_true")
    args = parser.parse_args()
    cache = ROOT / ".vision-cache"
    task = cache / "face_landmarker.task"
    digest = download(FACE, task)
    if digest != FACE_SHA256:
        raise RuntimeError(f"Unexpected Face Landmarker SHA256: {digest}")
    for target in (MODULE / "android/src/main/assets/face_landmarker.task", MODULE / "ios/Resources/face_landmarker.task"):
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(task, target)
    manifest = {"face_landmarker": {"url": FACE, "sha256": digest}}
    if args.ios or os.environ.get("EAS_BUILD_PLATFORM") == "ios":
        archive = cache / "opencv-4.5.3.tar.gz"
        cv_hash = download(OPENCV, archive)
        if cv_hash != OPENCV_SHA256:
            raise RuntimeError(f"Unexpected OpenCV SHA256: {cv_hash}")
        framework = MODULE / "ios/Frameworks/opencv2.framework"
        install_opencv_headers(archive, framework)
        manifest["opencv_ios"] = {
            "url": OPENCV,
            "sha256": cv_hash,
            "headers_only": True,
            "matches_mediapipe": "4.5.3",
        }
    (cache / "provenance.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
